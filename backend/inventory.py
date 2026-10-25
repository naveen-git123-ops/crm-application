"""Inventory module: warehouses, ledger, purchasing, transfers, alerts, and reports.

Stock quantities change only through post_movement(). Product edits cannot
change on-hand quantity or average cost. Purchase orders increase incoming
quantity when approved and increase on-hand only when a goods receipt is posted.
"""
from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func, inspect, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from inventory_calc import (
    available,
    average_after_removal,
    money,
    q,
    suggested_reorder,
    weighted_average,
)

NEG_KEY = 'inventory.allow_negative'

PO_STATUSES = (
    'draft', 'pending_approval', 'approved', 'partially_received', 'received', 'cancelled',
)
TRANSFER_STATUSES = ('draft', 'in_transit', 'received', 'cancelled')
OPEN_PO = ('draft', 'pending_approval', 'approved', 'partially_received')

MOVEMENT_LABELS = {
    'opening_balance': 'Opening balance',
    'purchase_receipt': 'Purchase receipt',
    'adjustment_increase': 'Adjustment increase',
    'adjustment_decrease': 'Adjustment decrease',
    'transfer_dispatch': 'Transfer dispatch',
    'transfer_receipt': 'Transfer receipt',
    'reversal': 'Reversal',
}

WarehouseModel = None
BalanceModel = None
TransactionModel = None
TransactionLineModel = None
SupplierModel = None
PurchaseOrderModel = None
PurchaseOrderLineModel = None
GoodsReceiptModel = None
GoodsReceiptLineModel = None
TransferModel = None
TransferLineModel = None
AlertModel = None
StockItem = None


class InventoryError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def setup(Base, stock_item_model):
    """Register inventory tables on the application Base. Safe to call once."""
    global WarehouseModel, BalanceModel, TransactionModel, TransactionLineModel
    global SupplierModel, PurchaseOrderModel, PurchaseOrderLineModel
    global GoodsReceiptModel, GoodsReceiptLineModel, TransferModel, TransferLineModel
    global AlertModel, StockItem
    if WarehouseModel is not None:
        return
    StockItem = stock_item_model

    class WarehouseModel(Base):
        __tablename__ = 'warehouses'
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
        name = Column(String(255), nullable=False, unique=True, index=True)
        address = Column(String(500), nullable=True)
        contact_name = Column(String(255), nullable=True)
        contact_phone = Column(String(50), nullable=True)
        manager_employee_id = Column(String(50), nullable=True)
        manager_name = Column(String(255), nullable=True)
        is_active = Column(Integer, nullable=False, default=1)
        is_default = Column(Integer, nullable=False, default=0)
        notes = Column(String(1000), nullable=True)
        created_at = Column(DateTime, default=datetime.now)
        updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    class BalanceModel(Base):
        __tablename__ = 'inventory_balances'
        __table_args__ = (UniqueConstraint('stock_item_id', 'warehouse_id', name='uq_balance_item_warehouse'),)
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
        stock_item_id = Column(String(36), ForeignKey('stock_items.id'), nullable=False, index=True)
        warehouse_id = Column(String(36), ForeignKey('warehouses.id'), nullable=False, index=True)
        on_hand = Column(Numeric(14, 3), nullable=False, default=0)
        reserved = Column(Numeric(14, 3), nullable=False, default=0)
        damaged = Column(Numeric(14, 3), nullable=False, default=0)
        incoming = Column(Numeric(14, 3), nullable=False, default=0)
        avg_cost = Column(Numeric(14, 2), nullable=False, default=0)

    class TransactionModel(Base):
        __tablename__ = 'inventory_transactions'
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
        number = Column(String(40), nullable=False, unique=True, index=True)
        idempotency_key = Column(String(120), nullable=True, unique=True, index=True)
        movement_type = Column(String(40), nullable=False, index=True)
        reference_type = Column(String(40), nullable=True, index=True)
        reference_id = Column(String(36), nullable=True, index=True)
        reference_label = Column(String(80), nullable=True)
        reverses_transaction_id = Column(String(36), nullable=True, index=True)
        reason = Column(String(1000), nullable=True)
        notes = Column(String(1000), nullable=True)
        actor_employee_id = Column(String(50), nullable=True)
        actor_name = Column(String(255), nullable=True)
        posted_at = Column(DateTime, nullable=False, default=datetime.now, index=True)

    class TransactionLineModel(Base):
        __tablename__ = 'inventory_transaction_lines'
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
        transaction_id = Column(String(36), ForeignKey('inventory_transactions.id'), nullable=False, index=True)
        stock_item_id = Column(String(36), ForeignKey('stock_items.id'), nullable=False, index=True)
        warehouse_id = Column(String(36), ForeignKey('warehouses.id'), nullable=False, index=True)
        qty_before = Column(Numeric(14, 3), nullable=False)
        qty_change = Column(Numeric(14, 3), nullable=False)
        qty_after = Column(Numeric(14, 3), nullable=False)
        unit_cost = Column(Numeric(14, 2), nullable=False, default=0)
        value_change = Column(Numeric(14, 2), nullable=False, default=0)
        avg_cost_before = Column(Numeric(14, 2), nullable=False, default=0)
        avg_cost_after = Column(Numeric(14, 2), nullable=False, default=0)

    class SupplierModel(Base):
        __tablename__ = 'suppliers'
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
        name = Column(String(255), nullable=False, index=True)
        contact_person = Column(String(255), nullable=True)
        email = Column(String(255), nullable=True)
        phone = Column(String(50), nullable=True)
        address = Column(String(500), nullable=True)
        tax_id = Column(String(50), nullable=True)
        payment_terms = Column(String(255), nullable=True)
        status = Column(String(20), nullable=False, default='active', index=True)
        notes = Column(String(2000), nullable=True)
        created_at = Column(DateTime, default=datetime.now)
        updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    class PurchaseOrderModel(Base):
        __tablename__ = 'purchase_orders'
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
        number = Column(String(40), nullable=False, unique=True, index=True)
        supplier_id = Column(String(36), ForeignKey('suppliers.id'), nullable=False, index=True)
        warehouse_id = Column(String(36), ForeignKey('warehouses.id'), nullable=False, index=True)
        status = Column(String(32), nullable=False, default='draft', index=True)
        expected_date = Column(String(20), nullable=True)
        notes = Column(String(2000), nullable=True)
        terms = Column(String(1000), nullable=True)
        subtotal = Column(Numeric(14, 2), nullable=False, default=0)
        discount_amount = Column(Numeric(14, 2), nullable=False, default=0)
        tax_amount = Column(Numeric(14, 2), nullable=False, default=0)
        total = Column(Numeric(14, 2), nullable=False, default=0)
        created_by_employee_id = Column(String(50), nullable=True)
        created_by_name = Column(String(255), nullable=True)
        approved_by_employee_id = Column(String(50), nullable=True)
        approved_by_name = Column(String(255), nullable=True)
        approved_at = Column(DateTime, nullable=True)
        created_at = Column(DateTime, default=datetime.now, index=True)
        updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    class PurchaseOrderLineModel(Base):
        __tablename__ = 'purchase_order_lines'
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
        purchase_order_id = Column(String(36), ForeignKey('purchase_orders.id'), nullable=False, index=True)
        stock_item_id = Column(String(36), ForeignKey('stock_items.id'), nullable=False, index=True)
        description = Column(String(255), nullable=True)
        quantity = Column(Numeric(14, 3), nullable=False)
        received_qty = Column(Numeric(14, 3), nullable=False, default=0)
        unit_cost = Column(Numeric(14, 2), nullable=False, default=0)
        discount_percent = Column(Numeric(8, 2), nullable=False, default=0)
        tax_percent = Column(Numeric(8, 2), nullable=False, default=0)
        line_total = Column(Numeric(14, 2), nullable=False, default=0)

    class GoodsReceiptModel(Base):
        __tablename__ = 'goods_receipts'
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
        number = Column(String(40), nullable=False, unique=True, index=True)
        purchase_order_id = Column(String(36), ForeignKey('purchase_orders.id'), nullable=False, index=True)
        warehouse_id = Column(String(36), ForeignKey('warehouses.id'), nullable=False)
        supplier_ref = Column(String(120), nullable=True)
        idempotency_key = Column(String(120), nullable=False, unique=True)
        notes = Column(String(1000), nullable=True)
        actor_employee_id = Column(String(50), nullable=True)
        actor_name = Column(String(255), nullable=True)
        received_at = Column(DateTime, nullable=False, default=datetime.now, index=True)

    class GoodsReceiptLineModel(Base):
        __tablename__ = 'goods_receipt_lines'
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
        goods_receipt_id = Column(String(36), ForeignKey('goods_receipts.id'), nullable=False, index=True)
        purchase_order_line_id = Column(String(36), ForeignKey('purchase_order_lines.id'), nullable=False)
        stock_item_id = Column(String(36), ForeignKey('stock_items.id'), nullable=False)
        quantity = Column(Numeric(14, 3), nullable=False)
        unit_cost = Column(Numeric(14, 2), nullable=False, default=0)

    class TransferModel(Base):
        __tablename__ = 'stock_transfers'
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
        number = Column(String(40), nullable=False, unique=True, index=True)
        from_warehouse_id = Column(String(36), ForeignKey('warehouses.id'), nullable=False, index=True)
        to_warehouse_id = Column(String(36), ForeignKey('warehouses.id'), nullable=False, index=True)
        status = Column(String(20), nullable=False, default='draft', index=True)
        notes = Column(String(1000), nullable=True)
        dispatched_at = Column(DateTime, nullable=True)
        received_at = Column(DateTime, nullable=True)
        created_by_employee_id = Column(String(50), nullable=True)
        created_by_name = Column(String(255), nullable=True)
        created_at = Column(DateTime, default=datetime.now, index=True)
        updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    class TransferLineModel(Base):
        __tablename__ = 'stock_transfer_lines'
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
        transfer_id = Column(String(36), ForeignKey('stock_transfers.id'), nullable=False, index=True)
        stock_item_id = Column(String(36), ForeignKey('stock_items.id'), nullable=False, index=True)
        quantity = Column(Numeric(14, 3), nullable=False)
        qty_dispatched = Column(Numeric(14, 3), nullable=False, default=0)
        qty_received = Column(Numeric(14, 3), nullable=False, default=0)
        unit_cost = Column(Numeric(14, 2), nullable=False, default=0)

    class AlertModel(Base):
        __tablename__ = 'stock_alerts'
        id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
        alert_type = Column(String(40), nullable=False, index=True)
        stock_item_id = Column(String(36), ForeignKey('stock_items.id'), nullable=False, index=True)
        warehouse_id = Column(String(36), ForeignKey('warehouses.id'), nullable=False, index=True)
        severity = Column(String(20), nullable=False, default='warning')
        status = Column(String(20), nullable=False, default='open', index=True)
        message = Column(String(500), nullable=False)
        suggested_qty = Column(Numeric(14, 3), nullable=False, default=0)
        open_key = Column(String(200), nullable=True, unique=True)
        created_at = Column(DateTime, default=datetime.now)
        updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
        resolved_at = Column(DateTime, nullable=True)


def _require_setup():
    if WarehouseModel is None:
        raise RuntimeError('Inventory models are not registered')


def _now() -> datetime:
    return datetime.now()


def _iso(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(timespec='seconds')
    return str(value)


def _num(value) -> float:
    return float(q(value))


def _money(value) -> float:
    return float(money(value))


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text_value = str(value).strip()
    return text_value or None


def _actor(actor) -> tuple[Optional[str], str]:
    employee_id = getattr(actor, 'employee_id', None) or getattr(actor, 'id', None)
    name = getattr(actor, 'name', None) or 'System'
    return employee_id, name


def _is_admin(actor) -> bool:
    return (getattr(actor, 'role', '') or '').strip().lower() == 'admin'


def _page(page: int, page_size: int) -> tuple[int, int]:
    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(page_size or 25)))
    return page, page_size


def negative_allowed(db: Session) -> bool:
    """Read the negative-stock flag without rolling back the caller's transaction.

    Schema inspection on the live connection issues a ROLLBACK in SQLite, which
    would discard the stock rows being posted. A savepoint keeps that lookup isolated.
    """
    try:
        with db.begin_nested():
            row = db.execute(text('SELECT value FROM app_settings WHERE key = :k'), {'k': NEG_KEY}).first()
    except Exception:
        return False
    if not row or row[0] is None:
        return False
    return str(row[0]).strip().lower() in {'1', 'true', 'yes', 'on'}


def _next_number(db: Session, model, prefix: str) -> str:
    highest = 0
    for (num,) in db.query(model.number).all():
        if not num or not str(num).startswith(prefix + '-'):
            continue
        try:
            highest = max(highest, int(str(num).split('-')[-1]))
        except ValueError:
            continue
    return f'{prefix}-{highest + 1:05d}'


def get_or_create_warehouse(db: Session, name: Optional[str]):
    _require_setup()
    label = _clean(name) or 'Default'
    row = db.query(WarehouseModel).filter(WarehouseModel.name == label).first()
    if row:
        return row
    row = WarehouseModel(name=label, is_active=1, is_default=1 if label == 'Default' else 0)
    db.add(row)
    db.flush()
    return row


def _warehouse(db: Session, warehouse_id: str, allow_inactive: bool = False):
    row = db.query(WarehouseModel).filter(WarehouseModel.id == warehouse_id).first()
    if not row:
        raise InventoryError('Warehouse not found', 404)
    if not row.is_active and not allow_inactive:
        raise InventoryError('Warehouse is inactive')
    return row


def _product(db: Session, stock_item_id: str, allow_archived: bool = False):
    row = db.query(StockItem).filter(StockItem.id == stock_item_id).first()
    if not row:
        raise InventoryError('Product not found', 404)
    if (getattr(row, 'status', None) or 'active') != 'active' and not allow_archived:
        raise InventoryError('Product is archived')
    return row


def get_balance(db: Session, stock_item_id: str, warehouse_id: str, for_update: bool = True):
    query = db.query(BalanceModel).filter(
        BalanceModel.stock_item_id == stock_item_id,
        BalanceModel.warehouse_id == warehouse_id,
    )
    bind = db.get_bind()
    if for_update and bind is not None and bind.dialect.name != 'sqlite':
        query = query.with_for_update()
    row = query.first()
    if row:
        return row
    row = BalanceModel(
        stock_item_id=stock_item_id,
        warehouse_id=warehouse_id,
        on_hand=q(0),
        reserved=q(0),
        damaged=q(0),
        incoming=q(0),
        avg_cost=money(0),
    )
    nested = db.begin_nested()
    db.add(row)
    try:
        db.flush()
        nested.commit()
    except IntegrityError:
        nested.rollback()
        row = query.first()
        if not row:
            raise InventoryError('Could not lock the inventory balance. Retry the operation.', 409)
    return row


def _touch_item(item, actor):
    employee_id, name = _actor(actor) if actor is not None else (None, None)
    if employee_id:
        item.updated_by_employee_id = employee_id
    if name:
        item.updated_by_name = name
    item.updated_at = _now()


def refresh_item_cache(db: Session, item):
    balances = db.query(BalanceModel).filter(BalanceModel.stock_item_id == item.id).all()
    total_qty = q(0)
    total_value = Decimal('0')
    primary = None
    primary_qty = q(-1)
    for bal in balances:
        on_hand = q(bal.on_hand)
        total_qty += on_hand
        total_value += on_hand * money(bal.avg_cost)
        if on_hand > primary_qty:
            primary_qty = on_hand
            primary = bal
    item.quantity = float(total_qty)
    item.value = float(money(total_value))
    if total_qty > 0:
        item.rate = float(money(total_value / total_qty))
    if primary is not None:
        wh = db.query(WarehouseModel).filter(WarehouseModel.id == primary.warehouse_id).first()
        if wh:
            item.godown = wh.name


def _reorder_target(item) -> Decimal:
    if getattr(item, 'reorder_qty', None) not in (None, '') and q(item.reorder_qty) > 0:
        return q(item.reorder_qty)
    if getattr(item, 'reorder_level', None) not in (None, ''):
        return q(item.reorder_level)
    if getattr(item, 'min_stock', None) not in (None, ''):
        return q(item.min_stock)
    return q(0)


def sync_alerts_for_item(db: Session, item):
    rows = db.query(AlertModel).filter(AlertModel.stock_item_id == item.id, AlertModel.status != 'resolved').all()
    if (getattr(item, 'status', None) or 'active') != 'active':
        for alert in rows:
            alert.status = 'resolved'
            alert.resolved_at = _now()
            alert.open_key = None
        return
    balances = db.query(BalanceModel).filter(BalanceModel.stock_item_id == item.id).all()
    active_keys = set()
    for bal in balances:
        on_hand = q(bal.on_hand)
        wh = db.query(WarehouseModel).filter(WarehouseModel.id == bal.warehouse_id).first()
        wh_name = wh.name if wh else 'Warehouse'
        target = _reorder_target(item)
        suggested = suggested_reorder(target, on_hand, bal.incoming, bal.reserved)
        specs = []
        if on_hand <= 0:
            specs.append(('out_of_stock', 'critical', f'{item.name} is out of stock at {wh_name}.'))
        else:
            if getattr(item, 'min_stock', None) not in (None, '') and on_hand <= q(item.min_stock):
                specs.append(('low_stock', 'warning', f'{item.name} is at or below its minimum stock at {wh_name}.'))
            if getattr(item, 'reorder_level', None) not in (None, '') and on_hand <= q(item.reorder_level):
                specs.append(('below_reorder', 'warning', f'{item.name} is at or below its reorder level at {wh_name}.'))
        for alert_type, severity, message in specs:
            open_key = f'{alert_type}:{item.id}:{bal.warehouse_id}'
            active_keys.add(open_key)
            existing = db.query(AlertModel).filter(AlertModel.open_key == open_key).first()
            if existing:
                existing.severity = severity
                existing.message = message
                existing.suggested_qty = suggested
                existing.updated_at = _now()
                if existing.status == 'resolved':
                    existing.status = 'open'
                    existing.resolved_at = None
            else:
                db.add(AlertModel(
                    alert_type=alert_type,
                    stock_item_id=item.id,
                    warehouse_id=bal.warehouse_id,
                    severity=severity,
                    status='open',
                    message=message,
                    suggested_qty=suggested,
                    open_key=open_key,
                ))
    for alert in rows:
        if alert.open_key and alert.open_key not in active_keys:
            alert.status = 'resolved'
            alert.resolved_at = _now()
            alert.open_key = None
            alert.updated_at = _now()


def sync_alerts(db: Session, stock_item_id: Optional[str] = None):
    query = db.query(StockItem)
    if stock_item_id:
        query = query.filter(StockItem.id == stock_item_id)
    for item in query.all():
        sync_alerts_for_item(db, item)


def post_movement(
    db: Session,
    *,
    movement_type: str,
    lines: list[dict],
    actor,
    idempotency_key: str,
    reason: Optional[str] = None,
    notes: Optional[str] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[str] = None,
    reference_label: Optional[str] = None,
    reverses_transaction_id: Optional[str] = None,
    allow_negative: Optional[bool] = None,
):
    _require_setup()
    key = _clean(idempotency_key)
    if not key:
        raise InventoryError('An idempotency key is required')
    if db.query(TransactionModel).filter(TransactionModel.idempotency_key == key).first():
        raise InventoryError('This transaction was already posted', 409)
    if not lines:
        raise InventoryError('A stock transaction needs at least one line')
    if allow_negative is None:
        allow_negative = negative_allowed(db)
    employee_id, actor_name = _actor(actor)
    txn = TransactionModel(
        number=_next_number(db, TransactionModel, 'MV'),
        idempotency_key=key,
        movement_type=movement_type,
        reference_type=reference_type,
        reference_id=reference_id,
        reference_label=reference_label,
        reverses_transaction_id=reverses_transaction_id,
        reason=_clean(reason),
        notes=_clean(notes),
        actor_employee_id=employee_id,
        actor_name=actor_name,
        posted_at=_now(),
    )
    db.add(txn)
    db.flush()
    touched = set()
    ordered = sorted(lines, key=lambda line: (str(line['stock_item_id']), str(line['warehouse_id'])))
    for line in ordered:
        item = _product(db, line['stock_item_id'], allow_archived=movement_type in {'reversal', 'opening_balance'})
        _warehouse(db, line['warehouse_id'], allow_inactive=movement_type == 'reversal')
        effect = line['cost_effect']
        change = q(line['qty_change'])
        if effect == 'in' and change <= 0:
            raise InventoryError('Inbound quantity must be greater than zero')
        if effect in {'out', 'reverse_in'} and change >= 0:
            raise InventoryError('Outbound quantity must be greater than zero')
        bal = get_balance(db, item.id, line['warehouse_id'])
        qty_before = q(bal.on_hand)
        avg_before = money(bal.avg_cost)
        unit_cost = line.get('unit_cost')
        if effect == 'out':
            unit_cost = avg_before if unit_cost is None else money(unit_cost)
            avg_after = avg_before
        elif effect == 'in':
            unit_cost = avg_before if unit_cost is None else money(unit_cost)
            avg_after = weighted_average(qty_before, avg_before, change, unit_cost)
        elif effect == 'reverse_in':
            if unit_cost is None:
                raise InventoryError('Reversal cost is missing')
            unit_cost = money(unit_cost)
            avg_after = average_after_removal(qty_before, avg_before, abs(change), unit_cost)
        else:
            raise InventoryError('Unknown stock cost effect')
        qty_after = q(qty_before + change)
        if not allow_negative and qty_after < q(q(bal.reserved) + q(bal.damaged)):
            avail = available(qty_before, bal.reserved, bal.damaged)
            raise InventoryError(f'Not enough available stock for {item.name}. Available is {avail}.')
        bal.on_hand = qty_after
        bal.avg_cost = avg_after
        db.add(TransactionLineModel(
            transaction_id=txn.id,
            stock_item_id=item.id,
            warehouse_id=line['warehouse_id'],
            qty_before=qty_before,
            qty_change=change,
            qty_after=qty_after,
            unit_cost=unit_cost,
            value_change=money(change * unit_cost),
            avg_cost_before=avg_before,
            avg_cost_after=avg_after,
        ))
        touched.add(item.id)
    db.flush()
    for item_id in touched:
        item = db.query(StockItem).filter(StockItem.id == item_id).first()
        if item:
            refresh_item_cache(db, item)
            _touch_item(item, actor)
            sync_alerts_for_item(db, item)
    return txn


def reverse_transaction(db: Session, transaction_id: str, reason: str, actor, idempotency_key: str):
    if not _clean(reason):
        raise InventoryError('A reason is required to reverse a stock transaction')
    txn = db.query(TransactionModel).filter(TransactionModel.id == transaction_id).first()
    if not txn:
        raise InventoryError('Stock transaction not found', 404)
    if txn.movement_type == 'reversal':
        raise InventoryError('Reverse the original transaction instead of a reversal')
    existing = db.query(TransactionModel).filter(TransactionModel.reverses_transaction_id == txn.id).first()
    if existing:
        raise InventoryError('This transaction was already reversed', 409)
    source_lines = db.query(TransactionLineModel).filter(TransactionLineModel.transaction_id == txn.id).all()
    if not source_lines:
        raise InventoryError('This transaction has no lines to reverse')
    lines = []
    for line in source_lines:
        change = q(line.qty_change)
        if change > 0:
            lines.append({
                'stock_item_id': line.stock_item_id,
                'warehouse_id': line.warehouse_id,
                'qty_change': q(-change),
                'unit_cost': line.unit_cost,
                'cost_effect': 'reverse_in',
            })
        elif change < 0:
            lines.append({
                'stock_item_id': line.stock_item_id,
                'warehouse_id': line.warehouse_id,
                'qty_change': q(-change),
                'unit_cost': line.unit_cost,
                'cost_effect': 'in',
            })
    return post_movement(
        db,
        movement_type='reversal',
        lines=lines,
        actor=actor,
        idempotency_key=idempotency_key,
        reason=reason,
        reference_type='inventory_transaction',
        reference_id=txn.id,
        reference_label=txn.number,
        reverses_transaction_id=txn.id,
    )


def _sku_taken(db: Session, sku: str, ignore_id: Optional[str] = None) -> bool:
    query = db.query(StockItem).filter(func.lower(StockItem.sku) == sku.lower())
    if ignore_id:
        query = query.filter(StockItem.id != ignore_id)
    return query.first() is not None


def _apply_master(item, data: dict):
    if 'name' in data:
        name = _clean(data.get('name'))
        if not name:
            raise InventoryError('Item name is required')
        item.name = name
    for field in ('alias', 'item_code', 'barcode', 'stock_group', 'hsn_code', 'notes'):
        if field in data:
            setattr(item, field, _clean(data.get(field)))
    if 'unit' in data:
        item.unit = _clean(data.get('unit')) or 'Nos'
    if 'sku' in data:
        sku = _clean(data.get('sku'))
        if sku and _sku_taken(db_from_item(item), sku, item.id):
            raise InventoryError('SKU must be unique', 409)
        item.sku = sku
    if 'selling_price' in data and data.get('selling_price') is not None:
        item.selling_price = money(data.get('selling_price'))
    if 'tax_percent' in data and data.get('tax_percent') is not None:
        item.tax_percent = money(data.get('tax_percent'))
    for field in ('reorder_level', 'min_stock', 'reorder_qty'):
        if field in data:
            raw = data.get(field)
            setattr(item, field, None if raw in (None, '') else q(raw))
    if 'preferred_supplier_id' in data:
        supplier_id = _clean(data.get('preferred_supplier_id'))
        if supplier_id and not db_from_item(item).query(SupplierModel).filter(SupplierModel.id == supplier_id).first():
            raise InventoryError('Supplier not found', 404)
        item.preferred_supplier_id = supplier_id
    if 'status' in data and data.get('status'):
        status = str(data.get('status')).strip().lower()
        if status not in {'active', 'archived'}:
            raise InventoryError('Status must be active or archived')
        item.status = status


def db_from_item(item):
    return Session.object_session(item)


def create_product(db: Session, data: dict, actor):
    _require_setup()
    name = _clean(data.get('name'))
    if not name:
        raise InventoryError('Item name is required')
    sku = _clean(data.get('sku'))
    if sku and _sku_taken(db, sku):
        raise InventoryError('SKU must be unique', 409)
    supplier_id = _clean(data.get('preferred_supplier_id'))
    if supplier_id and not db.query(SupplierModel).filter(SupplierModel.id == supplier_id).first():
        raise InventoryError('Supplier not found', 404)
    if data.get('quantity') not in (None, ''):
        opening = data.get('quantity')
    else:
        opening = data.get('opening_qty') or 0
    cost = data.get('opening_cost') if data.get('opening_cost') not in (None, '') else data.get('rate') or 0
    warehouse = None
    if _clean(data.get('warehouse_id')):
        warehouse = _warehouse(db, data['warehouse_id'])
    else:
        warehouse = get_or_create_warehouse(db, data.get('godown'))
    employee_id, actor_name = _actor(actor)
    item = StockItem(
        name=name,
        alias=_clean(data.get('alias')),
        item_code=_clean(data.get('item_code')),
        sku=sku,
        barcode=_clean(data.get('barcode')),
        stock_group=_clean(data.get('stock_group')),
        unit=_clean(data.get('unit')) or 'Nos',
        hsn_code=_clean(data.get('hsn_code')),
        godown=warehouse.name,
        opening_qty=float(q(opening)),
        quantity=0,
        rate=float(money(cost)),
        value=0,
        selling_price=money(data.get('selling_price') or 0),
        tax_percent=money(data.get('tax_percent') or 0),
        reorder_level=None if data.get('reorder_level') in (None, '') else float(q(data.get('reorder_level'))),
        min_stock=None if data.get('min_stock') in (None, '') else q(data.get('min_stock')),
        reorder_qty=None if data.get('reorder_qty') in (None, '') else q(data.get('reorder_qty')),
        preferred_supplier_id=supplier_id,
        status='active',
        notes=_clean(data.get('notes')),
        created_by_employee_id=employee_id,
        created_by_name=actor_name,
        updated_by_employee_id=employee_id,
        updated_by_name=actor_name,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(item)
    db.flush()
    if q(opening) != 0:
        post_movement(
            db,
            movement_type='opening_balance',
            lines=[{
                'stock_item_id': item.id,
                'warehouse_id': warehouse.id,
                'qty_change': q(opening),
                'unit_cost': money(cost),
                'cost_effect': 'in',
            }],
            actor=actor,
            idempotency_key=f'opening:{item.id}',
            reason='Opening stock',
            reference_type='stock_item',
            reference_id=item.id,
            reference_label=item.name,
        )
    else:
        bal = get_balance(db, item.id, warehouse.id)
        bal.avg_cost = money(cost)
        item.godown = warehouse.name
        sync_alerts_for_item(db, item)
    return item


def update_product(db: Session, item_id: str, data: dict, actor):
    item = db.query(StockItem).filter(StockItem.id == item_id).first()
    if not item:
        raise InventoryError('Product not found', 404)
    for blocked in ('quantity', 'opening_qty', 'rate', 'value', 'godown', 'warehouse_id'):
        data.pop(blocked, None)
    _apply_master(item, data)
    _touch_item(item, actor)
    sync_alerts_for_item(db, item)
    return item


def archive_or_delete_product(db: Session, item_id: str):
    item = db.query(StockItem).filter(StockItem.id == item_id).first()
    if not item:
        raise InventoryError('Product not found', 404)
    has_lines = db.query(TransactionLineModel).filter(TransactionLineModel.stock_item_id == item.id).first()
    has_po = db.query(PurchaseOrderLineModel).filter(PurchaseOrderLineModel.stock_item_id == item.id).first()
    if has_lines or has_po:
        item.status = 'archived'
        item.updated_at = _now()
        sync_alerts_for_item(db, item)
        return {'message': 'Stock item archived. Posted history was kept.', 'status': 'archived'}
    db.query(BalanceModel).filter(BalanceModel.stock_item_id == item.id).delete()
    db.query(AlertModel).filter(AlertModel.stock_item_id == item.id).delete()
    db.delete(item)
    return {'message': 'Stock item deleted', 'status': 'deleted'}


def product_dict(item) -> dict:
    qty = q(item.quantity)
    low_level = None
    if getattr(item, 'reorder_level', None) not in (None, ''):
        low_level = q(item.reorder_level)
    elif getattr(item, 'min_stock', None) not in (None, ''):
        low_level = q(item.min_stock)
    if qty <= 0:
        stock_status = 'out'
    elif low_level is not None and qty <= low_level:
        stock_status = 'low'
    else:
        stock_status = 'ok'
    return {
        'id': item.id,
        'name': item.name,
        'alias': item.alias,
        'item_code': item.item_code,
        'sku': item.sku,
        'barcode': item.barcode,
        'stock_group': item.stock_group,
        'unit': item.unit or 'Nos',
        'hsn_code': item.hsn_code,
        'godown': item.godown,
        'opening_qty': _num(item.opening_qty),
        'quantity': _num(item.quantity),
        'rate': _money(item.rate),
        'value': _money(item.value),
        'selling_price': _money(getattr(item, 'selling_price', 0) or 0),
        'tax_percent': _money(getattr(item, 'tax_percent', 0) or 0),
        'reorder_level': None if item.reorder_level is None else _num(item.reorder_level),
        'min_stock': None if getattr(item, 'min_stock', None) is None else _num(item.min_stock),
        'reorder_qty': None if getattr(item, 'reorder_qty', None) is None else _num(item.reorder_qty),
        'preferred_supplier_id': getattr(item, 'preferred_supplier_id', None),
        'status': getattr(item, 'status', None) or 'active',
        'stock_status': stock_status,
        'notes': item.notes,
        'created_at': _iso(item.created_at),
        'updated_at': _iso(item.updated_at),
    }


def balance_dict(db: Session, bal) -> dict:
    wh = db.query(WarehouseModel).filter(WarehouseModel.id == bal.warehouse_id).first()
    on_hand = q(bal.on_hand)
    return {
        'id': bal.id,
        'stock_item_id': bal.stock_item_id,
        'warehouse_id': bal.warehouse_id,
        'warehouse_name': wh.name if wh else None,
        'on_hand': _num(on_hand),
        'reserved': _num(bal.reserved),
        'damaged': _num(bal.damaged),
        'incoming': _num(bal.incoming),
        'available': _num(available(on_hand, bal.reserved, bal.damaged)),
        'avg_cost': _money(bal.avg_cost),
        'cost_value': _money(on_hand * money(bal.avg_cost)),
    }


def warehouse_dict(row) -> dict:
    return {
        'id': row.id,
        'name': row.name,
        'address': row.address,
        'contact_name': row.contact_name,
        'contact_phone': row.contact_phone,
        'manager_employee_id': row.manager_employee_id,
        'manager_name': row.manager_name,
        'is_active': bool(row.is_active),
        'is_default': bool(row.is_default),
        'notes': row.notes,
    }


def save_warehouse(db: Session, data: dict, warehouse_id: Optional[str] = None):
    name = _clean(data.get('name'))
    if not name:
        raise InventoryError('Warehouse name is required')
    existing = db.query(WarehouseModel).filter(func.lower(WarehouseModel.name) == name.lower())
    if warehouse_id:
        row = db.query(WarehouseModel).filter(WarehouseModel.id == warehouse_id).first()
        if not row:
            raise InventoryError('Warehouse not found', 404)
        existing = existing.filter(WarehouseModel.id != warehouse_id)
    else:
        row = WarehouseModel()
        db.add(row)
    if existing.first():
        raise InventoryError('A warehouse with this name already exists', 409)
    row.name = name
    row.address = _clean(data.get('address'))
    row.contact_name = _clean(data.get('contact_name'))
    row.contact_phone = _clean(data.get('contact_phone'))
    row.manager_employee_id = _clean(data.get('manager_employee_id'))
    row.manager_name = _clean(data.get('manager_name'))
    row.notes = _clean(data.get('notes'))
    if 'is_active' in data and data.get('is_active') is not None:
        row.is_active = 1 if data.get('is_active') else 0
    elif warehouse_id is None:
        row.is_active = 1
    if data.get('is_default'):
        db.query(WarehouseModel).update({WarehouseModel.is_default: 0})
        row.is_default = 1
    row.updated_at = _now()
    db.flush()
    return row


def supplier_dict(row) -> dict:
    return {
        'id': row.id,
        'name': row.name,
        'contact_person': row.contact_person,
        'email': row.email,
        'phone': row.phone,
        'address': row.address,
        'tax_id': row.tax_id,
        'payment_terms': row.payment_terms,
        'status': row.status or 'active',
        'notes': row.notes,
        'created_at': _iso(row.created_at),
        'updated_at': _iso(row.updated_at),
    }


def save_supplier(db: Session, data: dict, supplier_id: Optional[str] = None):
    name = _clean(data.get('name'))
    if not name:
        raise InventoryError('Supplier name is required')
    if supplier_id:
        row = db.query(SupplierModel).filter(SupplierModel.id == supplier_id).first()
        if not row:
            raise InventoryError('Supplier not found', 404)
    else:
        row = SupplierModel(status='active')
        db.add(row)
    row.name = name
    for field in ('contact_person', 'email', 'phone', 'address', 'tax_id', 'payment_terms', 'notes'):
        if field in data:
            setattr(row, field, _clean(data.get(field)))
    if data.get('status'):
        status = str(data['status']).strip().lower()
        if status not in {'active', 'archived'}:
            raise InventoryError('Status must be active or archived')
        row.status = status
    row.updated_at = _now()
    db.flush()
    return row


def _line_amounts(qty, unit_cost, discount_percent, tax_percent):
    qty = q(qty)
    unit_cost = money(unit_cost)
    discount_percent = money(discount_percent or 0)
    tax_percent = money(tax_percent or 0)
    if discount_percent < 0 or discount_percent > 100 or tax_percent < 0 or tax_percent > 100:
        raise InventoryError('Discount and tax percents must be between 0 and 100')
    gross = qty * unit_cost
    discount = money(gross * discount_percent / Decimal('100'))
    net = money(gross - discount)
    tax = money(net * tax_percent / Decimal('100'))
    return discount, net, tax, money(net + tax)


def _recalc_po(db: Session, po):
    lines = db.query(PurchaseOrderLineModel).filter(PurchaseOrderLineModel.purchase_order_id == po.id).all()
    subtotal = Decimal('0')
    discount = Decimal('0')
    tax = Decimal('0')
    for line in lines:
        line_discount, net, line_tax, total = _line_amounts(
            line.quantity, line.unit_cost, line.discount_percent, line.tax_percent,
        )
        line.line_total = total
        subtotal += net
        discount += line_discount
        tax += line_tax
    po.subtotal = money(subtotal)
    po.discount_amount = money(discount)
    po.tax_amount = money(tax)
    po.total = money(subtotal + tax)
    po.updated_at = _now()


def _replace_po_lines(db: Session, po, lines: list[dict]):
    if not lines:
        raise InventoryError('Add at least one product line')
    db.query(PurchaseOrderLineModel).filter(PurchaseOrderLineModel.purchase_order_id == po.id).delete()
    for raw in lines:
        item = _product(db, raw['stock_item_id'])
        qty = q(raw.get('quantity'))
        if qty <= 0:
            raise InventoryError(f'Quantity for {item.name} must be greater than zero')
        discount, _net, _tax, total = _line_amounts(
            qty, raw.get('unit_cost') or 0, raw.get('discount_percent') or 0, raw.get('tax_percent') or 0,
        )
        db.add(PurchaseOrderLineModel(
            purchase_order_id=po.id,
            stock_item_id=item.id,
            description=item.name,
            quantity=qty,
            received_qty=q(0),
            unit_cost=money(raw.get('unit_cost') or 0),
            discount_percent=money(raw.get('discount_percent') or 0),
            tax_percent=money(raw.get('tax_percent') or 0),
            line_total=total,
        ))
    db.flush()
    _recalc_po(db, po)


def po_dict(db: Session, po, with_lines: bool = False) -> dict:
    supplier = db.query(SupplierModel).filter(SupplierModel.id == po.supplier_id).first()
    warehouse = db.query(WarehouseModel).filter(WarehouseModel.id == po.warehouse_id).first()
    data = {
        'id': po.id,
        'number': po.number,
        'supplier_id': po.supplier_id,
        'supplier_name': supplier.name if supplier else None,
        'warehouse_id': po.warehouse_id,
        'warehouse_name': warehouse.name if warehouse else None,
        'status': po.status,
        'expected_date': po.expected_date,
        'notes': po.notes,
        'terms': po.terms,
        'subtotal': _money(po.subtotal),
        'discount_amount': _money(po.discount_amount),
        'tax_amount': _money(po.tax_amount),
        'total': _money(po.total),
        'created_by_employee_id': po.created_by_employee_id,
        'created_by_name': po.created_by_name,
        'approved_by_name': po.approved_by_name,
        'approved_at': _iso(po.approved_at),
        'created_at': _iso(po.created_at),
        'updated_at': _iso(po.updated_at),
    }
    if with_lines:
        lines = db.query(PurchaseOrderLineModel).filter(PurchaseOrderLineModel.purchase_order_id == po.id).all()
        data['lines'] = [{
            'id': line.id,
            'stock_item_id': line.stock_item_id,
            'description': line.description,
            'quantity': _num(line.quantity),
            'received_qty': _num(line.received_qty),
            'outstanding_qty': _num(q(line.quantity) - q(line.received_qty)),
            'unit_cost': _money(line.unit_cost),
            'discount_percent': _money(line.discount_percent),
            'tax_percent': _money(line.tax_percent),
            'line_total': _money(line.line_total),
        } for line in lines]
        receipts = db.query(GoodsReceiptModel).filter(GoodsReceiptModel.purchase_order_id == po.id).order_by(GoodsReceiptModel.received_at.desc()).all()
        data['receipts'] = [{
            'id': row.id,
            'number': row.number,
            'supplier_ref': row.supplier_ref,
            'received_at': _iso(row.received_at),
            'actor_name': row.actor_name,
        } for row in receipts]
    return data


def create_purchase_order(db: Session, data: dict, actor):
    supplier = db.query(SupplierModel).filter(SupplierModel.id == data.get('supplier_id')).first()
    if not supplier or (supplier.status or 'active') != 'active':
        raise InventoryError('Choose an active supplier', 404)
    warehouse = _warehouse(db, data.get('warehouse_id'))
    employee_id, actor_name = _actor(actor)
    po = PurchaseOrderModel(
        number=_next_number(db, PurchaseOrderModel, 'PO'),
        supplier_id=supplier.id,
        warehouse_id=warehouse.id,
        status='draft',
        expected_date=_clean(data.get('expected_date')),
        notes=_clean(data.get('notes')),
        terms=_clean(data.get('terms')),
        created_by_employee_id=employee_id,
        created_by_name=actor_name,
    )
    db.add(po)
    db.flush()
    _replace_po_lines(db, po, data.get('lines') or [])
    return po


def update_purchase_order(db: Session, po_id: str, data: dict):
    po = db.query(PurchaseOrderModel).filter(PurchaseOrderModel.id == po_id).first()
    if not po:
        raise InventoryError('Purchase order not found', 404)
    if po.status != 'draft':
        raise InventoryError('Only draft purchase orders can be edited')
    if data.get('supplier_id'):
        supplier = db.query(SupplierModel).filter(SupplierModel.id == data['supplier_id']).first()
        if not supplier:
            raise InventoryError('Supplier not found', 404)
        po.supplier_id = supplier.id
    if data.get('warehouse_id'):
        po.warehouse_id = _warehouse(db, data['warehouse_id']).id
    if 'expected_date' in data:
        po.expected_date = _clean(data.get('expected_date'))
    if 'notes' in data:
        po.notes = _clean(data.get('notes'))
    if 'terms' in data:
        po.terms = _clean(data.get('terms'))
    if data.get('lines') is not None:
        _replace_po_lines(db, po, data.get('lines') or [])
    return po


def submit_purchase_order(db: Session, po_id: str):
    po = db.query(PurchaseOrderModel).filter(PurchaseOrderModel.id == po_id).first()
    if not po:
        raise InventoryError('Purchase order not found', 404)
    if po.status != 'draft':
        raise InventoryError('Only a draft purchase order can be submitted')
    lines = db.query(PurchaseOrderLineModel).filter(PurchaseOrderLineModel.purchase_order_id == po.id).all()
    if not lines:
        raise InventoryError('Add at least one product before submitting')
    po.status = 'pending_approval'
    po.updated_at = _now()
    return po


def _add_incoming(db: Session, stock_item_id: str, warehouse_id: str, delta):
    bal = get_balance(db, stock_item_id, warehouse_id, for_update=True)
    incoming = q(q(bal.incoming) + q(delta))
    if incoming < 0:
        incoming = q(0)
    bal.incoming = incoming


def approve_purchase_order(db: Session, po_id: str, actor):
    po = db.query(PurchaseOrderModel).filter(PurchaseOrderModel.id == po_id).first()
    if not po:
        raise InventoryError('Purchase order not found', 404)
    if po.status != 'pending_approval':
        raise InventoryError('Only a purchase order pending approval can be approved')
    employee_id, actor_name = _actor(actor)
    if not _is_admin(actor) and po.created_by_employee_id and po.created_by_employee_id == employee_id:
        raise InventoryError('You cannot approve a purchase order you created', 403)
    lines = db.query(PurchaseOrderLineModel).filter(PurchaseOrderLineModel.purchase_order_id == po.id).all()
    for line in lines:
        outstanding = q(line.quantity) - q(line.received_qty)
        if outstanding > 0:
            _add_incoming(db, line.stock_item_id, po.warehouse_id, outstanding)
    po.status = 'approved'
    po.approved_by_employee_id = employee_id
    po.approved_by_name = actor_name
    po.approved_at = _now()
    po.updated_at = _now()
    return po


def cancel_purchase_order(db: Session, po_id: str):
    po = db.query(PurchaseOrderModel).filter(PurchaseOrderModel.id == po_id).first()
    if not po:
        raise InventoryError('Purchase order not found', 404)
    if po.status in {'received', 'cancelled'}:
        raise InventoryError('This purchase order cannot be cancelled')
    if po.status in {'approved', 'partially_received'}:
        lines = db.query(PurchaseOrderLineModel).filter(PurchaseOrderLineModel.purchase_order_id == po.id).all()
        for line in lines:
            outstanding = q(line.quantity) - q(line.received_qty)
            if outstanding > 0:
                _add_incoming(db, line.stock_item_id, po.warehouse_id, -outstanding)
    po.status = 'cancelled'
    po.updated_at = _now()
    return po


def receive_purchase_order(db: Session, po_id: str, data: dict, actor):
    po = db.query(PurchaseOrderModel).filter(PurchaseOrderModel.id == po_id).first()
    if not po:
        raise InventoryError('Purchase order not found', 404)
    if po.status not in {'approved', 'partially_received'}:
        raise InventoryError('Stock increases only when an approved purchase order is received')
    key = _clean(data.get('idempotency_key'))
    if not key:
        raise InventoryError('An idempotency key is required')
    if db.query(GoodsReceiptModel).filter(GoodsReceiptModel.idempotency_key == key).first():
        raise InventoryError('This goods receipt was already posted', 409)
    supplier_ref = _clean(data.get('supplier_ref'))
    if supplier_ref:
        duplicate = db.query(GoodsReceiptModel).filter(
            GoodsReceiptModel.purchase_order_id == po.id,
            GoodsReceiptModel.supplier_ref == supplier_ref,
        ).first()
        if duplicate:
            raise InventoryError('A receipt with this supplier reference already exists for the purchase order', 409)
    payload_lines = data.get('lines') or []
    if not payload_lines:
        raise InventoryError('Enter a received quantity')
    employee_id, actor_name = _actor(actor)
    receipt = GoodsReceiptModel(
        number=_next_number(db, GoodsReceiptModel, 'GR'),
        purchase_order_id=po.id,
        warehouse_id=po.warehouse_id,
        supplier_ref=supplier_ref,
        idempotency_key=key,
        notes=_clean(data.get('notes')),
        actor_employee_id=employee_id,
        actor_name=actor_name,
        received_at=_now(),
    )
    db.add(receipt)
    db.flush()
    move_lines = []
    for raw in payload_lines:
        line = db.query(PurchaseOrderLineModel).filter(
            PurchaseOrderLineModel.id == raw.get('purchase_order_line_id'),
            PurchaseOrderLineModel.purchase_order_id == po.id,
        ).first()
        if not line:
            raise InventoryError('Purchase order line not found', 404)
        qty = q(raw.get('quantity'))
        if qty <= 0:
            continue
        outstanding = q(line.quantity) - q(line.received_qty)
        if qty > outstanding:
            raise InventoryError(f'Received quantity for {line.description or "an item"} exceeds the outstanding quantity')
        unit_cost = money(raw.get('unit_cost') if raw.get('unit_cost') not in (None, '') else line.unit_cost)
        line.received_qty = q(q(line.received_qty) + qty)
        _add_incoming(db, line.stock_item_id, po.warehouse_id, -qty)
        db.add(GoodsReceiptLineModel(
            goods_receipt_id=receipt.id,
            purchase_order_line_id=line.id,
            stock_item_id=line.stock_item_id,
            quantity=qty,
            unit_cost=unit_cost,
        ))
        move_lines.append({
            'stock_item_id': line.stock_item_id,
            'warehouse_id': po.warehouse_id,
            'qty_change': qty,
            'unit_cost': unit_cost,
            'cost_effect': 'in',
        })
    if not move_lines:
        raise InventoryError('Enter a received quantity greater than zero')
    post_movement(
        db,
        movement_type='purchase_receipt',
        lines=move_lines,
        actor=actor,
        idempotency_key=key,
        reason='Goods receipt',
        notes=receipt.notes,
        reference_type='goods_receipt',
        reference_id=receipt.id,
        reference_label=receipt.number,
    )
    lines = db.query(PurchaseOrderLineModel).filter(PurchaseOrderLineModel.purchase_order_id == po.id).all()
    if all(q(line.received_qty) >= q(line.quantity) for line in lines):
        po.status = 'received'
    else:
        po.status = 'partially_received'
    po.updated_at = _now()
    return receipt


def adjust_stock(db: Session, data: dict, actor):
    reason = _clean(data.get('reason'))
    if not reason:
        raise InventoryError('A reason is required to adjust stock')
    direction = (data.get('direction') or '').strip().lower()
    qty = q(data.get('quantity'))
    if qty <= 0:
        raise InventoryError('Quantity must be greater than zero')
    item = _product(db, data.get('stock_item_id'))
    warehouse = _warehouse(db, data.get('warehouse_id'))
    if direction == 'increase':
        movement_type = 'adjustment_increase'
        change = qty
        effect = 'in'
        unit_cost = data.get('unit_cost')
    elif direction == 'decrease':
        movement_type = 'adjustment_decrease'
        change = q(-qty)
        effect = 'out'
        unit_cost = None
    else:
        raise InventoryError('Direction must be increase or decrease')
    return post_movement(
        db,
        movement_type=movement_type,
        lines=[{
            'stock_item_id': item.id,
            'warehouse_id': warehouse.id,
            'qty_change': change,
            'unit_cost': unit_cost,
            'cost_effect': effect,
        }],
        actor=actor,
        idempotency_key=data.get('idempotency_key') or f'adj-{uuid.uuid4()}',
        reason=reason,
        notes=_clean(data.get('notes')),
        reference_type='adjustment',
        reference_label='Adjustment',
    )


def transfer_dict(db: Session, row, with_lines: bool = False) -> dict:
    source = db.query(WarehouseModel).filter(WarehouseModel.id == row.from_warehouse_id).first()
    dest = db.query(WarehouseModel).filter(WarehouseModel.id == row.to_warehouse_id).first()
    data = {
        'id': row.id,
        'number': row.number,
        'from_warehouse_id': row.from_warehouse_id,
        'from_warehouse_name': source.name if source else None,
        'to_warehouse_id': row.to_warehouse_id,
        'to_warehouse_name': dest.name if dest else None,
        'status': row.status,
        'notes': row.notes,
        'dispatched_at': _iso(row.dispatched_at),
        'received_at': _iso(row.received_at),
        'created_by_name': row.created_by_name,
        'created_at': _iso(row.created_at),
    }
    if with_lines:
        lines = db.query(TransferLineModel).filter(TransferLineModel.transfer_id == row.id).all()
        data['lines'] = []
        for line in lines:
            item = db.query(StockItem).filter(StockItem.id == line.stock_item_id).first()
            data['lines'].append({
                'id': line.id,
                'stock_item_id': line.stock_item_id,
                'product_name': item.name if item else None,
                'unit': item.unit if item else None,
                'quantity': _num(line.quantity),
                'qty_dispatched': _num(line.qty_dispatched),
                'qty_received': _num(line.qty_received),
                'in_transit': _num(q(line.qty_dispatched) - q(line.qty_received)),
                'unit_cost': _money(line.unit_cost),
            })
    return data


def create_transfer(db: Session, data: dict, actor):
    source = _warehouse(db, data.get('from_warehouse_id'))
    dest = _warehouse(db, data.get('to_warehouse_id'))
    if source.id == dest.id:
        raise InventoryError('Choose two different warehouses')
    raw_lines = data.get('lines') or []
    if not raw_lines:
        raise InventoryError('Add at least one product to transfer')
    employee_id, actor_name = _actor(actor)
    row = TransferModel(
        number=_next_number(db, TransferModel, 'TR'),
        from_warehouse_id=source.id,
        to_warehouse_id=dest.id,
        status='draft',
        notes=_clean(data.get('notes')),
        created_by_employee_id=employee_id,
        created_by_name=actor_name,
    )
    db.add(row)
    db.flush()
    seen = set()
    for raw in raw_lines:
        item = _product(db, raw.get('stock_item_id'))
        if item.id in seen:
            raise InventoryError(f'{item.name} is already on this transfer')
        seen.add(item.id)
        qty = q(raw.get('quantity'))
        if qty <= 0:
            raise InventoryError(f'Quantity for {item.name} must be greater than zero')
        db.add(TransferLineModel(
            transfer_id=row.id,
            stock_item_id=item.id,
            quantity=qty,
            qty_dispatched=q(0),
            qty_received=q(0),
            unit_cost=money(0),
        ))
    db.flush()
    return row


def dispatch_transfer(db: Session, transfer_id: str, actor, idempotency_key: str):
    row = db.query(TransferModel).filter(TransferModel.id == transfer_id).first()
    if not row:
        raise InventoryError('Transfer not found', 404)
    if row.status != 'draft':
        raise InventoryError('Only a draft transfer can be dispatched')
    lines = db.query(TransferLineModel).filter(TransferLineModel.transfer_id == row.id).all()
    move_lines = []
    for line in lines:
        qty = q(line.quantity)
        move_lines.append({
            'stock_item_id': line.stock_item_id,
            'warehouse_id': row.from_warehouse_id,
            'qty_change': q(-qty),
            'unit_cost': None,
            'cost_effect': 'out',
        })
    txn = post_movement(
        db,
        movement_type='transfer_dispatch',
        lines=move_lines,
        actor=actor,
        idempotency_key=idempotency_key,
        reason='Transfer dispatch',
        reference_type='stock_transfer',
        reference_id=row.id,
        reference_label=row.number,
    )
    posted = db.query(TransactionLineModel).filter(TransactionLineModel.transaction_id == txn.id).all()
    for line in lines:
        match = next(entry for entry in posted if entry.stock_item_id == line.stock_item_id)
        line.qty_dispatched = q(line.quantity)
        line.unit_cost = money(match.unit_cost)
    row.status = 'in_transit'
    row.dispatched_at = _now()
    row.updated_at = _now()
    return row


def receive_transfer(db: Session, transfer_id: str, data: dict, actor):
    row = db.query(TransferModel).filter(TransferModel.id == transfer_id).first()
    if not row:
        raise InventoryError('Transfer not found', 404)
    if row.status != 'in_transit':
        raise InventoryError('Only an in-transit transfer can be received')
    key = _clean(data.get('idempotency_key'))
    if not key:
        raise InventoryError('An idempotency key is required')
    lines = db.query(TransferLineModel).filter(TransferLineModel.transfer_id == row.id).all()
    requested = {entry.get('transfer_line_id'): entry.get('quantity') for entry in (data.get('lines') or [])}
    move_lines = []
    for line in lines:
        outstanding = q(line.qty_dispatched) - q(line.qty_received)
        if requested:
            if line.id not in requested:
                continue
            qty = q(requested[line.id])
        else:
            qty = outstanding
        if qty <= 0:
            continue
        if qty > outstanding:
            raise InventoryError('Received quantity exceeds the quantity in transit')
        line.qty_received = q(q(line.qty_received) + qty)
        move_lines.append({
            'stock_item_id': line.stock_item_id,
            'warehouse_id': row.to_warehouse_id,
            'qty_change': qty,
            'unit_cost': line.unit_cost,
            'cost_effect': 'in',
        })
    if not move_lines:
        raise InventoryError('Nothing is left to receive')
    post_movement(
        db,
        movement_type='transfer_receipt',
        lines=move_lines,
        actor=actor,
        idempotency_key=key,
        reason='Transfer receipt',
        reference_type='stock_transfer',
        reference_id=row.id,
        reference_label=row.number,
    )
    if all(q(line.qty_received) >= q(line.qty_dispatched) for line in lines):
        row.status = 'received'
        row.received_at = _now()
    row.updated_at = _now()
    return row


def cancel_transfer(db: Session, transfer_id: str, actor, idempotency_key: str, reason: Optional[str] = None):
    row = db.query(TransferModel).filter(TransferModel.id == transfer_id).first()
    if not row:
        raise InventoryError('Transfer not found', 404)
    lines = db.query(TransferLineModel).filter(TransferLineModel.transfer_id == row.id).all()
    if row.status == 'draft':
        row.status = 'cancelled'
        row.updated_at = _now()
        return row
    if row.status == 'in_transit' and all(q(line.qty_received) == 0 for line in lines):
        txn = db.query(TransactionModel).filter(
            TransactionModel.reference_type == 'stock_transfer',
            TransactionModel.reference_id == row.id,
            TransactionModel.movement_type == 'transfer_dispatch',
        ).first()
        if not txn:
            raise InventoryError('Dispatch transaction was not found')
        reverse_transaction(
            db, txn.id, _clean(reason) or 'Transfer cancelled', actor, idempotency_key,
        )
        row.status = 'cancelled'
        row.updated_at = _now()
        return row
    raise InventoryError('This transfer can no longer be cancelled')


def _movement_row(db: Session, line, txn, item, warehouse, reversed_ids: set) -> dict:
    return {
        'id': line.id,
        'transaction_id': txn.id,
        'number': txn.number,
        'movement_type': txn.movement_type,
        'movement_label': MOVEMENT_LABELS.get(txn.movement_type, txn.movement_type),
        'posted_at': _iso(txn.posted_at),
        'stock_item_id': line.stock_item_id,
        'product_name': item.name if item else None,
        'sku': item.sku if item else None,
        'unit': item.unit if item else None,
        'warehouse_id': line.warehouse_id,
        'warehouse_name': warehouse.name if warehouse else None,
        'qty_before': _num(line.qty_before),
        'qty_change': _num(line.qty_change),
        'qty_after': _num(line.qty_after),
        'unit_cost': _money(line.unit_cost),
        'value_change': _money(line.value_change),
        'reference_type': txn.reference_type,
        'reference_id': txn.reference_id,
        'reference_label': txn.reference_label,
        'reason': txn.reason,
        'actor_name': txn.actor_name,
        'reversed': txn.id in reversed_ids or txn.movement_type == 'reversal',
    }


def list_movements(db: Session, filters: dict):
    query = db.query(TransactionLineModel, TransactionModel, StockItem, WarehouseModel).join(
        TransactionModel, TransactionLineModel.transaction_id == TransactionModel.id,
    ).join(
        StockItem, TransactionLineModel.stock_item_id == StockItem.id,
    ).join(
        WarehouseModel, TransactionLineModel.warehouse_id == WarehouseModel.id,
    )
    if filters.get('stock_item_id'):
        query = query.filter(TransactionLineModel.stock_item_id == filters['stock_item_id'])
    if filters.get('warehouse_id'):
        query = query.filter(TransactionLineModel.warehouse_id == filters['warehouse_id'])
    if filters.get('movement_type'):
        query = query.filter(TransactionModel.movement_type == filters['movement_type'])
    if filters.get('q'):
        like = f"%{filters['q'].strip()}%"
        query = query.filter(or_(
            StockItem.name.ilike(like),
            StockItem.sku.ilike(like),
            TransactionModel.number.ilike(like),
            TransactionModel.reference_label.ilike(like),
        ))
    start, end = _range(filters.get('date_from'), filters.get('date_to'))
    if start:
        query = query.filter(TransactionModel.posted_at >= start)
    if end:
        query = query.filter(TransactionModel.posted_at < end)
    total = query.count()
    page, page_size = _page(filters.get('page') or 1, filters.get('page_size') or 25)
    rows = query.order_by(TransactionModel.posted_at.desc(), TransactionLineModel.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    txn_ids = [txn.id for _line, txn, _item, _wh in rows]
    reversed_ids = set()
    if txn_ids:
        reversed_ids = {
            value for (value,) in db.query(TransactionModel.reverses_transaction_id).filter(
                TransactionModel.reverses_transaction_id.in_(txn_ids)
            ).all() if value
        }
    return {
        'items': [_movement_row(db, line, txn, item, wh, reversed_ids) for line, txn, item, wh in rows],
        'total': total,
        'page': page,
        'page_size': page_size,
    }


def _range(date_from: Optional[str], date_to: Optional[str]):
    start = None
    end = None
    if date_from:
        try:
            start = datetime.strptime(str(date_from)[:10], '%Y-%m-%d')
        except ValueError:
            raise InventoryError('From date must be YYYY-MM-DD')
    if date_to:
        try:
            end = datetime.strptime(str(date_to)[:10], '%Y-%m-%d') + timedelta(days=1)
        except ValueError:
            raise InventoryError('To date must be YYYY-MM-DD')
    return start, end


def _low(item, qty: Decimal) -> bool:
    if qty <= 0:
        return False
    if getattr(item, 'min_stock', None) not in (None, '') and qty <= q(item.min_stock):
        return True
    if getattr(item, 'reorder_level', None) not in (None, '') and qty <= q(item.reorder_level):
        return True
    return False


def build_dashboard(db: Session, date_from: Optional[str], date_to: Optional[str]) -> dict:
    sync_alerts(db)
    if not date_from and not date_to:
        date_to = _now().strftime('%Y-%m-%d')
        date_from = (_now() - timedelta(days=29)).strftime('%Y-%m-%d')
    start, end = _range(date_from, date_to)
    products = db.query(StockItem).filter(or_(StockItem.status == 'active', StockItem.status.is_(None))).all()
    active = len(products)
    units = Decimal('0')
    cost_value = Decimal('0')
    selling_value = Decimal('0')
    low_count = 0
    out_count = 0
    categories: dict[str, Decimal] = {}
    low_rows = []
    for item in products:
        balances = db.query(BalanceModel).filter(BalanceModel.stock_item_id == item.id).all()
        qty = q(sum((q(bal.on_hand) for bal in balances), q(0)))
        value = sum((q(bal.on_hand) * money(bal.avg_cost) for bal in balances), Decimal('0'))
        units += qty
        cost_value += value
        selling_value += qty * money(getattr(item, 'selling_price', 0) or 0)
        group = item.stock_group or 'Uncategorised'
        categories[group] = categories.get(group, Decimal('0')) + value
        if qty <= 0:
            out_count += 1
        elif _low(item, qty):
            low_count += 1
            low_rows.append({
                'id': item.id,
                'name': item.name,
                'sku': item.sku,
                'quantity': _num(qty),
                'reorder_level': None if item.reorder_level is None else _num(item.reorder_level),
                'godown': item.godown,
            })
    pending = db.query(PurchaseOrderModel).filter(PurchaseOrderModel.status.in_(OPEN_PO)).count()
    move_query = db.query(TransactionLineModel, TransactionModel).join(
        TransactionModel, TransactionLineModel.transaction_id == TransactionModel.id,
    )
    if start:
        move_query = move_query.filter(TransactionModel.posted_at >= start)
    if end:
        move_query = move_query.filter(TransactionModel.posted_at < end)
    trend: dict[str, dict] = {}
    stock_out = Decimal('0')
    for line, txn in move_query.all():
        day = txn.posted_at.strftime('%Y-%m-%d') if txn.posted_at else ''
        bucket = trend.setdefault(day, {'date': day, 'in_qty': 0.0, 'out_qty': 0.0})
        change = q(line.qty_change)
        if change >= 0:
            bucket['in_qty'] = float(q(Decimal(str(bucket['in_qty'])) + change))
        else:
            bucket['out_qty'] = float(q(Decimal(str(bucket['out_qty'])) + abs(change)))
            stock_out += abs(change)
    recent_moves = list_movements(db, {'page': 1, 'page_size': 8, 'date_from': date_from, 'date_to': date_to})
    recent_pos = db.query(PurchaseOrderModel).order_by(PurchaseOrderModel.created_at.desc()).limit(5).all()
    alerts = db.query(AlertModel).filter(AlertModel.status.in_(('open', 'read'))).order_by(AlertModel.created_at.desc()).limit(6).all()
    return {
        'period': {'from': date_from, 'to': date_to},
        'definitions': {
            'cost_value': 'On-hand quantity multiplied by weighted average cost. This is inventory cost, not sales revenue or profit.',
            'selling_value': 'On-hand quantity multiplied by the current selling price. This is not revenue and is not profit.',
            'stock_out_quantity': 'Units posted out of a warehouse during the selected period.',
            'pending_purchase_orders': 'Purchase orders that are draft, waiting for approval, approved, or partially received.',
            'low_stock': 'Active products with on-hand above zero and at or below the reorder level or minimum stock.',
        },
        'kpis': {
            'active_products': active,
            'units_on_hand': _num(units),
            'cost_value': _money(cost_value),
            'selling_value': _money(selling_value),
            'low_stock': low_count,
            'out_of_stock': out_count,
            'pending_purchase_orders': pending,
            'stock_out_quantity': _num(stock_out),
        },
        'movement_trend': [trend[key] for key in sorted(trend)],
        'category_value': [
            {'category': name, 'cost_value': _money(value)}
            for name, value in sorted(categories.items(), key=lambda pair: pair[1], reverse=True)
        ],
        'recent_movements': recent_moves['items'],
        'recent_purchase_orders': [po_dict(db, po) for po in recent_pos],
        'low_stock': sorted(low_rows, key=lambda row: row['quantity'])[:8],
        'alerts': [_alert_dict(db, alert) for alert in alerts],
    }


def _alert_dict(db: Session, alert) -> dict:
    item = db.query(StockItem).filter(StockItem.id == alert.stock_item_id).first()
    wh = db.query(WarehouseModel).filter(WarehouseModel.id == alert.warehouse_id).first()
    return {
        'id': alert.id,
        'alert_type': alert.alert_type,
        'severity': alert.severity,
        'status': alert.status,
        'message': alert.message,
        'suggested_qty': _num(alert.suggested_qty),
        'stock_item_id': alert.stock_item_id,
        'product_name': item.name if item else None,
        'warehouse_id': alert.warehouse_id,
        'warehouse_name': wh.name if wh else None,
        'preferred_supplier_id': getattr(item, 'preferred_supplier_id', None) if item else None,
        'created_at': _iso(alert.created_at),
    }


REPORTS = {
    'current-stock': 'On-hand, reserved, incoming, and available quantity by product and warehouse. Available = on-hand − reserved − damaged. Incoming is not available.',
    'valuation': 'Inventory cost value is on-hand quantity × weighted average cost. Selling value uses the current selling price. These are not revenue or profit.',
    'low-stock': 'Balances above zero that are at or below the product minimum stock or reorder level.',
    'out-of-stock': 'Balances whose on-hand quantity is zero or below.',
    'movements': 'Posted ledger lines in the selected period. Quantity before, change, and after come from the immutable transaction.',
    'purchase-orders': 'Purchase orders created in the selected period. Order value is the purchase total, not inventory value.',
    'goods-received': 'Goods receipts posted in the selected period. Stock increased only on these receipts.',
}


def build_report(db: Session, kind: str, filters: dict) -> dict:
    if kind not in REPORTS:
        raise InventoryError('Unknown report', 404)
    page, page_size = _page(filters.get('page') or 1, filters.get('page_size') or 25)
    if kind in {'current-stock', 'valuation', 'low-stock', 'out-of-stock'}:
        columns = [
            ('product', 'Product'), ('sku', 'SKU'), ('group', 'Group'), ('warehouse', 'Warehouse'),
            ('on_hand', 'On hand'), ('reserved', 'Reserved'), ('incoming', 'Incoming'),
            ('available', 'Available'), ('avg_cost', 'Average cost'), ('cost_value', 'Cost value'),
            ('selling_price', 'Selling price'), ('selling_value', 'Selling value'),
        ]
        query = db.query(BalanceModel, StockItem, WarehouseModel).join(
            StockItem, BalanceModel.stock_item_id == StockItem.id,
        ).join(WarehouseModel, BalanceModel.warehouse_id == WarehouseModel.id)
        if filters.get('warehouse_id'):
            query = query.filter(BalanceModel.warehouse_id == filters['warehouse_id'])
        if filters.get('stock_group'):
            query = query.filter(StockItem.stock_group == filters['stock_group'])
        if filters.get('q'):
            like = f"%{filters['q'].strip()}%"
            query = query.filter(or_(StockItem.name.ilike(like), StockItem.sku.ilike(like)))
        rows = []
        for bal, item, wh in query.all():
            on_hand = q(bal.on_hand)
            if kind == 'low-stock' and not _low(item, on_hand):
                continue
            if kind == 'out-of-stock' and on_hand > 0:
                continue
            if kind == 'current-stock' and (item.status or 'active') != 'active' and on_hand == 0:
                continue
            selling = money(getattr(item, 'selling_price', 0) or 0)
            rows.append({
                'product': item.name,
                'sku': item.sku or '',
                'group': item.stock_group or '',
                'warehouse': wh.name,
                'on_hand': _num(on_hand),
                'reserved': _num(bal.reserved),
                'incoming': _num(bal.incoming),
                'available': _num(available(on_hand, bal.reserved, bal.damaged)),
                'avg_cost': _money(bal.avg_cost),
                'cost_value': _money(on_hand * money(bal.avg_cost)),
                'selling_price': _money(selling),
                'selling_value': _money(on_hand * selling),
            })
        rows.sort(key=lambda row: (row['product'], row['warehouse']))
    elif kind == 'movements':
        columns = [
            ('posted_at', 'Date'), ('number', 'Number'), ('movement_label', 'Type'),
            ('product_name', 'Product'), ('warehouse_name', 'Warehouse'),
            ('qty_before', 'Before'), ('qty_change', 'Change'), ('qty_after', 'After'),
            ('unit_cost', 'Unit cost'), ('value_change', 'Value change'),
            ('reference_label', 'Reference'), ('actor_name', 'User'), ('reason', 'Reason'),
        ]
        payload = list_movements(db, {**filters, 'page': 1, 'page_size': 10000})
        rows = payload['items']
    elif kind == 'purchase-orders':
        columns = [
            ('number', 'Number'), ('supplier_name', 'Supplier'), ('warehouse_name', 'Warehouse'),
            ('status', 'Status'), ('expected_date', 'Expected'), ('total', 'Order total'),
            ('created_at', 'Created'),
        ]
        query = db.query(PurchaseOrderModel)
        start, end = _range(filters.get('date_from'), filters.get('date_to'))
        if start:
            query = query.filter(PurchaseOrderModel.created_at >= start)
        if end:
            query = query.filter(PurchaseOrderModel.created_at < end)
        if filters.get('supplier_id'):
            query = query.filter(PurchaseOrderModel.supplier_id == filters['supplier_id'])
        if filters.get('warehouse_id'):
            query = query.filter(PurchaseOrderModel.warehouse_id == filters['warehouse_id'])
        rows = [po_dict(db, po) for po in query.order_by(PurchaseOrderModel.created_at.desc()).all()]
    else:
        columns = [
            ('received_at', 'Date'), ('number', 'Receipt'), ('po_number', 'Purchase order'),
            ('supplier_name', 'Supplier'), ('warehouse', 'Warehouse'), ('product', 'Product'),
            ('quantity', 'Quantity'), ('unit_cost', 'Unit cost'), ('supplier_ref', 'Supplier ref'),
        ]
        query = db.query(GoodsReceiptLineModel, GoodsReceiptModel).join(
            GoodsReceiptModel, GoodsReceiptLineModel.goods_receipt_id == GoodsReceiptModel.id,
        )
        start, end = _range(filters.get('date_from'), filters.get('date_to'))
        if start:
            query = query.filter(GoodsReceiptModel.received_at >= start)
        if end:
            query = query.filter(GoodsReceiptModel.received_at < end)
        rows = []
        for line, receipt in query.order_by(GoodsReceiptModel.received_at.desc()).all():
            po = db.query(PurchaseOrderModel).filter(PurchaseOrderModel.id == receipt.purchase_order_id).first()
            if filters.get('supplier_id') and po and po.supplier_id != filters['supplier_id']:
                continue
            if filters.get('warehouse_id') and receipt.warehouse_id != filters['warehouse_id']:
                continue
            item = db.query(StockItem).filter(StockItem.id == line.stock_item_id).first()
            supplier = db.query(SupplierModel).filter(SupplierModel.id == po.supplier_id).first() if po else None
            wh = db.query(WarehouseModel).filter(WarehouseModel.id == receipt.warehouse_id).first()
            rows.append({
                'received_at': _iso(receipt.received_at),
                'number': receipt.number,
                'po_number': po.number if po else '',
                'supplier_name': supplier.name if supplier else '',
                'warehouse': wh.name if wh else '',
                'product': item.name if item else '',
                'quantity': _num(line.quantity),
                'unit_cost': _money(line.unit_cost),
                'supplier_ref': receipt.supplier_ref or '',
            })
    total = len(rows)
    start_at = (page - 1) * page_size
    return {
        'kind': kind,
        'definition': REPORTS[kind],
        'period': {'from': filters.get('date_from'), 'to': filters.get('date_to')},
        'columns': [{'key': key, 'label': label} for key, label in columns],
        'rows': rows[start_at:start_at + page_size],
        'total': total,
        'page': page,
        'page_size': page_size,
    }


def export_report(db: Session, kind: str, filters: dict, export_format: str) -> StreamingResponse:
    filters = {**filters, 'page': 1, 'page_size': 10000}
    report = build_report(db, kind, filters)
    headers = [col['label'] for col in report['columns']]
    keys = [col['key'] for col in report['columns']]
    matrix = [[_export_cell(row.get(key)) for key in keys] for row in report['rows']]
    filename = f'{kind}.{ "xlsx" if export_format == "xlsx" else "csv" }'
    if export_format == 'xlsx':
        from openpyxl import Workbook
        book = Workbook()
        sheet = book.active
        sheet.title = 'Report'
        sheet.append([report['definition']])
        sheet.append([f"Period: {report['period']['from'] or 'any'} to {report['period']['to'] or 'any'}"])
        sheet.append([])
        sheet.append(headers)
        for record in matrix:
            sheet.append(record)
        buffer = io.BytesIO()
        book.save(buffer)
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'},
        )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([report['definition']])
    writer.writerow([f"Period: {report['period']['from'] or 'any'} to {report['period']['to'] or 'any'}"])
    writer.writerow([])
    writer.writerow(headers)
    writer.writerows(matrix)
    data = buffer.getvalue().encode('utf-8-sig')
    return StreamingResponse(
        iter([data]),
        media_type='text/csv',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )


def _export_cell(value):
    if isinstance(value, bool) or value is None:
        return '' if value is None else value
    if isinstance(value, (int, float, Decimal)):
        return float(value) if isinstance(value, Decimal) else value
    text_value = str(value)
    if text_value[:1] in {'=', '+', '-', '@'}:
        return "'" + text_value
    return text_value


def ensure_inventory_schema(engine):
    """Add stock master columns that create_all does not add to an existing table."""
    insp = inspect(engine)
    if not insp.has_table('stock_items'):
        return
    existing = {col['name'] for col in insp.get_columns('stock_items')}
    dialect = engine.dialect.name
    money_ddl = 'DECIMAL(14,2) NOT NULL DEFAULT 0' if dialect != 'sqlite' else 'NUMERIC NOT NULL DEFAULT 0'
    qty_ddl = 'DECIMAL(14,3) NULL' if dialect != 'sqlite' else 'NUMERIC NULL'
    statements = []
    mapping = {
        'sku': 'VARCHAR(100) NULL',
        'barcode': 'VARCHAR(100) NULL',
        'selling_price': money_ddl,
        'tax_percent': money_ddl,
        'min_stock': qty_ddl,
        'reorder_qty': qty_ddl,
        'preferred_supplier_id': 'VARCHAR(36) NULL',
        'status': "VARCHAR(20) NOT NULL DEFAULT 'active'",
    }
    for name, ddl in mapping.items():
        if name not in existing:
            statements.append(f'ALTER TABLE stock_items ADD COLUMN {name} {ddl}')
    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))
        indexes = {idx['name'] for idx in inspect(engine).get_indexes('stock_items')}
        unique = False
        try:
            for constraint in inspect(engine).get_unique_constraints('stock_items'):
                if constraint.get('column_names') == ['sku']:
                    unique = True
        except Exception:
            unique = False
        for idx in inspect(engine).get_indexes('stock_items'):
            if idx.get('unique') and idx.get('column_names') == ['sku']:
                unique = True
        if not unique and 'uq_stock_items_sku' not in indexes:
            try:
                conn.execute(text("UPDATE stock_items SET sku = NULL WHERE sku = ''"))
                conn.execute(text('CREATE UNIQUE INDEX uq_stock_items_sku ON stock_items (sku)'))
            except Exception as exc:
                print(f'SKU unique index skipped: {exc}')


def backfill_opening_balances(SessionLocal):
    """Turn existing stock_items quantities into opening ledger entries once."""
    _require_setup()
    db = SessionLocal()
    try:
        items = db.query(StockItem).all()
        created = 0
        for item in items:
            try:
                with db.begin_nested():
                    exists = db.query(BalanceModel).filter(BalanceModel.stock_item_id == item.id).first()
                    if exists:
                        continue
                    if not getattr(item, 'status', None):
                        item.status = 'active'
                    warehouse = get_or_create_warehouse(db, item.godown)
                    opening = q(item.quantity or 0)
                    cost = money(item.rate or 0)
                    actor = type('Actor', (), {'employee_id': None, 'name': 'Opening backfill', 'role': 'admin'})()
                    if opening > 0:
                        post_movement(
                            db,
                            movement_type='opening_balance',
                            lines=[{
                                'stock_item_id': item.id,
                                'warehouse_id': warehouse.id,
                                'qty_change': opening,
                                'unit_cost': cost,
                                'cost_effect': 'in',
                            }],
                            actor=actor,
                            idempotency_key=f'opening-backfill:{item.id}',
                            reason='Opening balance migrated from the stock item quantity',
                            reference_type='stock_item',
                            reference_id=item.id,
                            reference_label=item.name,
                            allow_negative=True,
                        )
                        created += 1
                    elif opening < 0:
                        post_movement(
                            db,
                            movement_type='adjustment_decrease',
                            lines=[{
                                'stock_item_id': item.id,
                                'warehouse_id': warehouse.id,
                                'qty_change': opening,
                                'unit_cost': cost,
                                'cost_effect': 'out',
                            }],
                            actor=actor,
                            idempotency_key=f'opening-backfill:{item.id}',
                            reason='Opening balance migrated from the stock item quantity',
                            reference_type='stock_item',
                            reference_id=item.id,
                            reference_label=item.name,
                            allow_negative=True,
                        )
                        bal = get_balance(db, item.id, warehouse.id, for_update=False)
                        bal.avg_cost = cost
                        item.rate = float(cost)
                        created += 1
                    else:
                        bal = get_balance(db, item.id, warehouse.id, for_update=False)
                        bal.avg_cost = cost
                        item.godown = warehouse.name
            except Exception as exc:
                print(f'Opening backfill skipped for {getattr(item, "id", "?")}: {exc}')
        db.commit()
        if created:
            print(f'Posted {created} opening stock transactions')
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


class ProductIn(BaseModel):
    name: str
    alias: Optional[str] = None
    item_code: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    stock_group: Optional[str] = None
    unit: Optional[str] = 'Nos'
    hsn_code: Optional[str] = None
    godown: Optional[str] = None
    warehouse_id: Optional[str] = None
    opening_qty: Optional[float] = 0
    opening_cost: Optional[float] = 0
    selling_price: Optional[float] = 0
    tax_percent: Optional[float] = 0
    reorder_level: Optional[float] = None
    min_stock: Optional[float] = None
    reorder_qty: Optional[float] = None
    preferred_supplier_id: Optional[str] = None
    notes: Optional[str] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    alias: Optional[str] = None
    item_code: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    stock_group: Optional[str] = None
    unit: Optional[str] = None
    hsn_code: Optional[str] = None
    selling_price: Optional[float] = None
    tax_percent: Optional[float] = None
    reorder_level: Optional[float] = None
    min_stock: Optional[float] = None
    reorder_qty: Optional[float] = None
    preferred_supplier_id: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class WarehouseIn(BaseModel):
    name: str
    address: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    manager_employee_id: Optional[str] = None
    manager_name: Optional[str] = None
    is_active: Optional[bool] = True
    is_default: Optional[bool] = False
    notes: Optional[str] = None


class SupplierIn(BaseModel):
    name: str
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    tax_id: Optional[str] = None
    payment_terms: Optional[str] = None
    status: Optional[str] = 'active'
    notes: Optional[str] = None


class OrderLineIn(BaseModel):
    stock_item_id: str
    quantity: float
    unit_cost: float = 0
    discount_percent: float = 0
    tax_percent: float = 0


class PurchaseOrderIn(BaseModel):
    supplier_id: str
    warehouse_id: str
    expected_date: Optional[str] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    lines: list[OrderLineIn] = Field(default_factory=list)


class ReceiveLineIn(BaseModel):
    purchase_order_line_id: str
    quantity: float
    unit_cost: Optional[float] = None


class ReceiveIn(BaseModel):
    idempotency_key: str
    supplier_ref: Optional[str] = None
    notes: Optional[str] = None
    lines: list[ReceiveLineIn]


class AdjustmentIn(BaseModel):
    stock_item_id: str
    warehouse_id: str
    direction: str
    quantity: float
    unit_cost: Optional[float] = None
    reason: str
    notes: Optional[str] = None
    idempotency_key: Optional[str] = None


class ReverseIn(BaseModel):
    reason: str
    idempotency_key: str


class TransferLineIn(BaseModel):
    stock_item_id: str
    quantity: float


class TransferIn(BaseModel):
    from_warehouse_id: str
    to_warehouse_id: str
    notes: Optional[str] = None
    lines: list[TransferLineIn]


class TransferReceiveLineIn(BaseModel):
    transfer_line_id: str
    quantity: float


class TransferReceiveIn(BaseModel):
    idempotency_key: str
    lines: list[TransferReceiveLineIn] = Field(default_factory=list)


class TransferActionIn(BaseModel):
    idempotency_key: str
    reason: Optional[str] = None


class SettingsIn(BaseModel):
    allow_negative: bool


def _write(db: Session, fn):
    try:
        result = fn()
        db.commit()
        return result
    except InventoryError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail='This record conflicts with an existing one')


def mount_inventory_routes(api_router: APIRouter):
    from server import AppSettingModel, UserModel, get_db, is_admin_user, require_stock_management

    def _filters(
        q: Optional[str] = None,
        stock_group: Optional[str] = None,
        warehouse_id: Optional[str] = None,
        supplier_id: Optional[str] = None,
        stock_item_id: Optional[str] = None,
        movement_type: Optional[str] = None,
        status: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        page: int = 1,
        page_size: int = 25,
    ):
        return {
            'q': q, 'stock_group': stock_group, 'warehouse_id': warehouse_id,
            'supplier_id': supplier_id, 'stock_item_id': stock_item_id,
            'movement_type': movement_type, 'status': status,
            'date_from': date_from, 'date_to': date_to, 'page': page, 'page_size': page_size,
        }

    @api_router.get('/inventory/dashboard')
    def inventory_dashboard(
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        current_user: UserModel = Depends(require_stock_management),
        db: Session = Depends(get_db),
    ):
        return _write(db, lambda: build_dashboard(db, date_from, date_to))

    @api_router.get('/inventory/settings')
    def inventory_settings(current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        return {'allow_negative': negative_allowed(db)}

    @api_router.put('/inventory/settings')
    def update_inventory_settings(
        body: SettingsIn,
        current_user: UserModel = Depends(require_stock_management),
        db: Session = Depends(get_db),
    ):
        if not is_admin_user(current_user):
            raise HTTPException(status_code=403, detail='Only an administrator can change inventory settings')

        def run():
            row = db.query(AppSettingModel).filter(AppSettingModel.key == NEG_KEY).first()
            if not row:
                row = AppSettingModel(key=NEG_KEY, value='true' if body.allow_negative else 'false')
                db.add(row)
            else:
                row.value = 'true' if body.allow_negative else 'false'
            row.updated_at = _now()
            return {'allow_negative': body.allow_negative}
        return _write(db, run)

    @api_router.get('/inventory/products')
    def list_products(
        q: Optional[str] = None,
        stock_group: Optional[str] = None,
        warehouse_id: Optional[str] = None,
        status: Optional[str] = Query('active'),
        page: int = 1,
        page_size: int = 25,
        current_user: UserModel = Depends(require_stock_management),
        db: Session = Depends(get_db),
    ):
        query = db.query(StockItem)
        if status == 'active':
            query = query.filter(or_(StockItem.status == 'active', StockItem.status.is_(None)))
        elif status and status != 'all':
            query = query.filter(StockItem.status == status)
        if q and q.strip():
            like = f'%{q.strip()}%'
            query = query.filter(or_(
                StockItem.name.ilike(like), StockItem.sku.ilike(like), StockItem.barcode.ilike(like),
                StockItem.item_code.ilike(like), StockItem.alias.ilike(like),
            ))
        if stock_group:
            query = query.filter(StockItem.stock_group == stock_group)
        if warehouse_id:
            ids = db.query(BalanceModel.stock_item_id).filter(BalanceModel.warehouse_id == warehouse_id)
            query = query.filter(StockItem.id.in_(ids))
        total = query.count()
        page, page_size = _page(page, page_size)
        rows = query.order_by(StockItem.name.asc()).offset((page - 1) * page_size).limit(page_size).all()
        groups = [
            value for (value,) in db.query(StockItem.stock_group).filter(
                StockItem.stock_group.isnot(None), StockItem.stock_group != '',
            ).distinct().order_by(StockItem.stock_group.asc()).all()
        ]
        return {'items': [product_dict(row) for row in rows], 'total': total, 'page': page, 'page_size': page_size, 'stock_groups': groups}

    @api_router.post('/inventory/products')
    def post_product(body: ProductIn, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        def run():
            item = create_product(db, body.model_dump(), current_user)
            db.flush()
            return product_dict(item)
        return _write(db, run)

    @api_router.get('/inventory/products/{item_id}')
    def get_product(item_id: str, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        item = db.query(StockItem).filter(StockItem.id == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail='Product not found')
        balances = db.query(BalanceModel).filter(BalanceModel.stock_item_id == item.id).all()
        history = list_movements(db, {'stock_item_id': item.id, 'page': 1, 'page_size': 50})
        return {'product': product_dict(item), 'balances': [balance_dict(db, bal) for bal in balances], 'movements': history['items']}

    @api_router.put('/inventory/products/{item_id}')
    def put_product(item_id: str, body: ProductUpdate, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        def run():
            item = update_product(db, item_id, body.model_dump(exclude_unset=True), current_user)
            return product_dict(item)
        return _write(db, run)

    @api_router.post('/inventory/products/{item_id}/archive')
    def archive_product(item_id: str, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        return _write(db, lambda: archive_or_delete_product(db, item_id))

    @api_router.get('/inventory/warehouses')
    def list_warehouses(current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        rows = db.query(WarehouseModel).order_by(WarehouseModel.name.asc()).all()
        return [warehouse_dict(row) for row in rows]

    @api_router.post('/inventory/warehouses')
    def post_warehouse(body: WarehouseIn, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        return _write(db, lambda: warehouse_dict(save_warehouse(db, body.model_dump())))

    @api_router.put('/inventory/warehouses/{warehouse_id}')
    def put_warehouse(warehouse_id: str, body: WarehouseIn, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        return _write(db, lambda: warehouse_dict(save_warehouse(db, body.model_dump(), warehouse_id)))

    @api_router.get('/inventory/warehouses/{warehouse_id}/stock')
    def warehouse_stock(warehouse_id: str, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        wh = db.query(WarehouseModel).filter(WarehouseModel.id == warehouse_id).first()
        if not wh:
            raise HTTPException(status_code=404, detail='Warehouse not found')
        balances = db.query(BalanceModel).filter(BalanceModel.warehouse_id == warehouse_id).all()
        items = []
        for bal in balances:
            item = db.query(StockItem).filter(StockItem.id == bal.stock_item_id).first()
            if not item:
                continue
            payload = balance_dict(db, bal)
            payload['product_name'] = item.name
            payload['sku'] = item.sku
            payload['unit'] = item.unit
            items.append(payload)
        items.sort(key=lambda row: row['product_name'] or '')
        return {'warehouse': warehouse_dict(wh), 'items': items}

    @api_router.get('/inventory/movements')
    def movements(current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db), filters: dict = Depends(_filters)):
        try:
            return list_movements(db, filters)
        except InventoryError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)

    @api_router.post('/inventory/adjustments')
    def post_adjustment(body: AdjustmentIn, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        def run():
            txn = adjust_stock(db, body.model_dump(), current_user)
            return {'transaction_id': txn.id, 'number': txn.number}
        return _write(db, run)

    @api_router.post('/inventory/movements/{transaction_id}/reverse')
    def post_reverse(transaction_id: str, body: ReverseIn, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        def run():
            txn = reverse_transaction(db, transaction_id, body.reason, current_user, body.idempotency_key)
            return {'transaction_id': txn.id, 'number': txn.number}
        return _write(db, run)

    @api_router.get('/inventory/suppliers')
    def list_suppliers(
        q: Optional[str] = None,
        status: Optional[str] = 'active',
        page: int = 1,
        page_size: int = 25,
        current_user: UserModel = Depends(require_stock_management),
        db: Session = Depends(get_db),
    ):
        query = db.query(SupplierModel)
        if status and status != 'all':
            query = query.filter(SupplierModel.status == status)
        if q and q.strip():
            like = f'%{q.strip()}%'
            query = query.filter(or_(SupplierModel.name.ilike(like), SupplierModel.phone.ilike(like), SupplierModel.email.ilike(like)))
        total = query.count()
        page, page_size = _page(page, page_size)
        rows = query.order_by(SupplierModel.name.asc()).offset((page - 1) * page_size).limit(page_size).all()
        return {'items': [supplier_dict(row) for row in rows], 'total': total, 'page': page, 'page_size': page_size}

    @api_router.post('/inventory/suppliers')
    def post_supplier(body: SupplierIn, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        return _write(db, lambda: supplier_dict(save_supplier(db, body.model_dump())))

    @api_router.put('/inventory/suppliers/{supplier_id}')
    def put_supplier(supplier_id: str, body: SupplierIn, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        return _write(db, lambda: supplier_dict(save_supplier(db, body.model_dump(), supplier_id)))

    @api_router.get('/inventory/suppliers/{supplier_id}')
    def get_supplier(supplier_id: str, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        row = db.query(SupplierModel).filter(SupplierModel.id == supplier_id).first()
        if not row:
            raise HTTPException(status_code=404, detail='Supplier not found')
        orders = db.query(PurchaseOrderModel).filter(PurchaseOrderModel.supplier_id == row.id).order_by(PurchaseOrderModel.created_at.desc()).limit(20).all()
        products = db.query(StockItem).filter(StockItem.preferred_supplier_id == row.id).order_by(StockItem.name.asc()).all()
        return {'supplier': supplier_dict(row), 'purchase_orders': [po_dict(db, po) for po in orders], 'products': [product_dict(item) for item in products]}

    @api_router.get('/inventory/purchase-orders')
    def list_pos(
        q: Optional[str] = None,
        status: Optional[str] = None,
        supplier_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 25,
        current_user: UserModel = Depends(require_stock_management),
        db: Session = Depends(get_db),
    ):
        query = db.query(PurchaseOrderModel)
        if status:
            query = query.filter(PurchaseOrderModel.status == status)
        if supplier_id:
            query = query.filter(PurchaseOrderModel.supplier_id == supplier_id)
        if q and q.strip():
            like = f'%{q.strip()}%'
            supplier_ids = [row.id for row in db.query(SupplierModel).filter(SupplierModel.name.ilike(like)).all()]
            query = query.filter(or_(PurchaseOrderModel.number.ilike(like), PurchaseOrderModel.supplier_id.in_(supplier_ids or [''])))
        total = query.count()
        page, page_size = _page(page, page_size)
        rows = query.order_by(PurchaseOrderModel.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return {'items': [po_dict(db, row) for row in rows], 'total': total, 'page': page, 'page_size': page_size}

    @api_router.post('/inventory/purchase-orders')
    def post_po(body: PurchaseOrderIn, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        def run():
            po = create_purchase_order(db, body.model_dump(), current_user)
            return po_dict(db, po, with_lines=True)
        return _write(db, run)

    @api_router.get('/inventory/purchase-orders/{po_id}')
    def get_po(po_id: str, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        po = db.query(PurchaseOrderModel).filter(PurchaseOrderModel.id == po_id).first()
        if not po:
            raise HTTPException(status_code=404, detail='Purchase order not found')
        return po_dict(db, po, with_lines=True)

    @api_router.put('/inventory/purchase-orders/{po_id}')
    def put_po(po_id: str, body: PurchaseOrderIn, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        return _write(db, lambda: po_dict(db, update_purchase_order(db, po_id, body.model_dump()), with_lines=True))

    @api_router.post('/inventory/purchase-orders/{po_id}/submit')
    def submit_po(po_id: str, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        return _write(db, lambda: po_dict(db, submit_purchase_order(db, po_id), with_lines=True))

    @api_router.post('/inventory/purchase-orders/{po_id}/approve')
    def approve_po(po_id: str, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        return _write(db, lambda: po_dict(db, approve_purchase_order(db, po_id, current_user), with_lines=True))

    @api_router.post('/inventory/purchase-orders/{po_id}/cancel')
    def cancel_po(po_id: str, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        return _write(db, lambda: po_dict(db, cancel_purchase_order(db, po_id), with_lines=True))

    @api_router.post('/inventory/purchase-orders/{po_id}/receive')
    def receive_po(po_id: str, body: ReceiveIn, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        def run():
            receipt = receive_purchase_order(db, po_id, body.model_dump(), current_user)
            po = db.query(PurchaseOrderModel).filter(PurchaseOrderModel.id == po_id).first()
            return {'receipt_number': receipt.number, 'purchase_order': po_dict(db, po, with_lines=True)}
        return _write(db, run)

    @api_router.get('/inventory/transfers')
    def list_transfers(
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 25,
        current_user: UserModel = Depends(require_stock_management),
        db: Session = Depends(get_db),
    ):
        query = db.query(TransferModel)
        if status:
            query = query.filter(TransferModel.status == status)
        total = query.count()
        page, page_size = _page(page, page_size)
        rows = query.order_by(TransferModel.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return {'items': [transfer_dict(db, row, with_lines=True) for row in rows], 'total': total, 'page': page, 'page_size': page_size}

    @api_router.post('/inventory/transfers')
    def post_transfer(body: TransferIn, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        return _write(db, lambda: transfer_dict(db, create_transfer(db, body.model_dump(), current_user), with_lines=True))

    @api_router.post('/inventory/transfers/{transfer_id}/dispatch')
    def dispatch(transfer_id: str, body: TransferActionIn, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        return _write(db, lambda: transfer_dict(db, dispatch_transfer(db, transfer_id, current_user, body.idempotency_key), with_lines=True))

    @api_router.post('/inventory/transfers/{transfer_id}/receive')
    def receive(transfer_id: str, body: TransferReceiveIn, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        return _write(db, lambda: transfer_dict(db, receive_transfer(db, transfer_id, body.model_dump(), current_user), with_lines=True))

    @api_router.post('/inventory/transfers/{transfer_id}/cancel')
    def cancel(transfer_id: str, body: TransferActionIn, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        return _write(db, lambda: transfer_dict(db, cancel_transfer(db, transfer_id, current_user, body.idempotency_key, body.reason), with_lines=True))

    @api_router.get('/inventory/alerts')
    def list_alerts(
        status: Optional[str] = 'open',
        current_user: UserModel = Depends(require_stock_management),
        db: Session = Depends(get_db),
    ):
        def run():
            sync_alerts(db)
            query = db.query(AlertModel)
            if status and status != 'all':
                if status == 'open':
                    query = query.filter(AlertModel.status.in_(('open', 'read')))
                else:
                    query = query.filter(AlertModel.status == status)
            rows = query.order_by(AlertModel.created_at.desc()).limit(300).all()
            return {
                'items': [_alert_dict(db, row) for row in rows],
                'definition': 'Suggested reorder = reorder target − on-hand − incoming + reserved, and never below zero. The target is the preferred reorder quantity, otherwise the reorder level, otherwise minimum stock.',
            }
        return _write(db, run)

    @api_router.post('/inventory/alerts/{alert_id}/read')
    def read_alert(alert_id: str, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        def run():
            alert = db.query(AlertModel).filter(AlertModel.id == alert_id).first()
            if not alert:
                raise InventoryError('Alert not found', 404)
            if alert.status == 'open':
                alert.status = 'read'
                alert.updated_at = _now()
            return _alert_dict(db, alert)
        return _write(db, run)

    @api_router.post('/inventory/alerts/{alert_id}/resolve')
    def resolve_alert(alert_id: str, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db)):
        def run():
            alert = db.query(AlertModel).filter(AlertModel.id == alert_id).first()
            if not alert:
                raise InventoryError('Alert not found', 404)
            alert.status = 'resolved'
            alert.resolved_at = _now()
            alert.open_key = None
            alert.updated_at = _now()
            return _alert_dict(db, alert)
        return _write(db, run)

    @api_router.get('/inventory/reports/{kind}')
    def report(kind: str, current_user: UserModel = Depends(require_stock_management), db: Session = Depends(get_db), filters: dict = Depends(_filters)):
        try:
            return build_report(db, kind, filters)
        except InventoryError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)

    @api_router.get('/inventory/reports/{kind}/export')
    def report_export(
        kind: str,
        export_format: str = Query('csv', alias='format'),
        current_user: UserModel = Depends(require_stock_management),
        db: Session = Depends(get_db),
        filters: dict = Depends(_filters),
    ):
        if export_format not in {'csv', 'xlsx'}:
            raise HTTPException(status_code=400, detail='Format must be csv or xlsx')
        try:
            return export_report(db, kind, filters, export_format)
        except InventoryError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)
