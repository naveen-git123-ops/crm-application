"""Inventory ledger tests. They use SQLite and do not touch the CRM database."""
import uuid

import pytest
from sqlalchemy import Column, DateTime, Float, Numeric, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

import inventory
from inventory import InventoryError
from inventory_calc import money, q, suggested_reorder, weighted_average

Base = declarative_base()


class StockItem(Base):
    __tablename__ = 'stock_items'
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    alias = Column(String(255))
    item_code = Column(String(100))
    sku = Column(String(100))
    barcode = Column(String(100))
    stock_group = Column(String(255))
    unit = Column(String(50), default='Nos')
    hsn_code = Column(String(50))
    godown = Column(String(255))
    opening_qty = Column(Float, default=0)
    quantity = Column(Float, default=0)
    rate = Column(Float, default=0)
    value = Column(Float, default=0)
    selling_price = Column(Numeric(14, 2), default=0)
    tax_percent = Column(Numeric(14, 2), default=0)
    reorder_level = Column(Float)
    min_stock = Column(Numeric(14, 3))
    reorder_qty = Column(Numeric(14, 3))
    preferred_supplier_id = Column(String(36))
    status = Column(String(20), default='active')
    notes = Column(String(1000))
    created_by_employee_id = Column(String(50))
    created_by_name = Column(String(255))
    updated_by_employee_id = Column(String(50))
    updated_by_name = Column(String(255))
    created_at = Column(DateTime)
    updated_at = Column(DateTime)


inventory.setup(Base, StockItem)
engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)


class Actor:
    def __init__(self, role='admin', employee_id='emp-1', name='Tester'):
        self.role = role
        self.employee_id = employee_id
        self.name = name


def _wipe(db):
    for model in (
        inventory.AlertModel,
        inventory.TransactionLineModel,
        inventory.TransactionModel,
        inventory.GoodsReceiptLineModel,
        inventory.GoodsReceiptModel,
        inventory.PurchaseOrderLineModel,
        inventory.PurchaseOrderModel,
        inventory.TransferLineModel,
        inventory.TransferModel,
        inventory.BalanceModel,
        inventory.SupplierModel,
        inventory.WarehouseModel,
        StockItem,
    ):
        db.query(model).delete()
    db.commit()


@pytest.fixture()
def db():
    session = Session()
    _wipe(session)
    yield session
    session.close()


def _warehouse(db, name='Main'):
    return inventory.get_or_create_warehouse(db, name)


def _stock(db, name='Widget', qty=10, cost=5, warehouse=None, **extra):
    warehouse = warehouse or _warehouse(db)
    item = inventory.create_product(db, {
        'name': name,
        'warehouse_id': warehouse.id,
        'quantity': qty,
        'rate': cost,
        **extra,
    }, Actor())
    db.flush()
    return item, warehouse


def _on_hand(db, item_id, warehouse_id):
    row = db.query(inventory.BalanceModel).filter_by(stock_item_id=item_id, warehouse_id=warehouse_id).first()
    return q(0 if row is None else row.on_hand)


def _avg(db, item_id, warehouse_id):
    row = db.query(inventory.BalanceModel).filter_by(stock_item_id=item_id, warehouse_id=warehouse_id).one()
    return money(row.avg_cost)


def _incoming(db, item_id, warehouse_id):
    row = db.query(inventory.BalanceModel).filter_by(stock_item_id=item_id, warehouse_id=warehouse_id).one()
    return q(row.incoming)


def _po(db, qty=10, cost=4, opening=0, actor=None):
    actor = actor or Actor()
    item, warehouse = _stock(db, qty=opening, cost=cost)
    supplier = inventory.save_supplier(db, {'name': f'Acme {uuid.uuid4().hex[:6]}'})
    po = inventory.create_purchase_order(db, {
        'supplier_id': supplier.id,
        'warehouse_id': warehouse.id,
        'lines': [{'stock_item_id': item.id, 'quantity': qty, 'unit_cost': cost}],
    }, actor)
    line = db.query(inventory.PurchaseOrderLineModel).filter_by(purchase_order_id=po.id).one()
    return item, warehouse, po, line


def test_reorder_and_average_formulas():
    assert weighted_average(10, 5, 10, 15) == money(10)
    assert weighted_average(0, 5, 10, 15) == money(15)
    assert suggested_reorder(20, 4, 6, 2) == q(12)
    assert suggested_reorder(5, 9, 0, 0) == q(0)


def test_opening_stock_and_weighted_average(db):
    item, warehouse = _stock(db, qty=10, cost=5)
    assert _on_hand(db, item.id, warehouse.id) == q(10)
    assert _avg(db, item.id, warehouse.id) == money(5)
    inventory.post_movement(
        db,
        movement_type='purchase_receipt',
        lines=[{
            'stock_item_id': item.id,
            'warehouse_id': warehouse.id,
            'qty_change': q(10),
            'unit_cost': money(15),
            'cost_effect': 'in',
        }],
        actor=Actor(),
        idempotency_key='avg-receipt',
        reason='Receipt',
    )
    assert _on_hand(db, item.id, warehouse.id) == q(20)
    assert _avg(db, item.id, warehouse.id) == money(10)
    assert money(item.rate) == money(10)


def test_sku_is_unique(db):
    warehouse = _warehouse(db)
    inventory.create_product(db, {'name': 'Bolt', 'sku': 'BOLT-1', 'warehouse_id': warehouse.id}, Actor())
    with pytest.raises(InventoryError) as exc:
        inventory.create_product(db, {'name': 'Bolt copy', 'sku': 'bolt-1', 'warehouse_id': warehouse.id}, Actor())
    assert exc.value.status_code == 409


def test_update_cannot_change_quantity(db):
    item, warehouse = _stock(db, qty=5, cost=8)
    inventory.update_product(db, item.id, {
        'name': 'Renamed',
        'quantity': 99,
        'rate': 50,
        'opening_qty': 1,
        'godown': 'Somewhere else',
    }, Actor())
    assert item.name == 'Renamed'
    assert q(item.quantity) == q(5)
    assert money(item.rate) == money(8)
    assert _on_hand(db, item.id, warehouse.id) == q(5)


def test_purchase_receipt_is_partial_and_posted_once(db):
    item, warehouse, po, line = _po(db, qty=10, cost=4, opening=0)
    inventory.submit_purchase_order(db, po.id)
    inventory.approve_purchase_order(db, po.id, Actor(role='admin', employee_id='boss', name='Boss'))
    assert _on_hand(db, item.id, warehouse.id) == q(0)
    assert _incoming(db, item.id, warehouse.id) == q(10)
    first = {
        'idempotency_key': 'receipt-1',
        'supplier_ref': 'DN-1',
        'lines': [{'purchase_order_line_id': line.id, 'quantity': 4}],
    }
    inventory.receive_purchase_order(db, po.id, first, Actor())
    assert po.status == 'partially_received'
    assert _on_hand(db, item.id, warehouse.id) == q(4)
    assert _incoming(db, item.id, warehouse.id) == q(6)
    with pytest.raises(InventoryError) as duplicate:
        inventory.receive_purchase_order(db, po.id, first, Actor())
    assert duplicate.value.status_code == 409
    assert _on_hand(db, item.id, warehouse.id) == q(4)
    inventory.receive_purchase_order(db, po.id, {
        'idempotency_key': 'receipt-2',
        'lines': [{'purchase_order_line_id': line.id, 'quantity': 6}],
    }, Actor())
    assert po.status == 'received'
    assert _on_hand(db, item.id, warehouse.id) == q(10)
    assert _incoming(db, item.id, warehouse.id) == q(0)
    assert money(item.rate) == money(4)


def test_manager_cannot_approve_own_purchase_order(db):
    buyer = Actor(role='manager', employee_id='buyer', name='Buyer')
    item, warehouse, po, _line = _po(db, actor=buyer)
    inventory.submit_purchase_order(db, po.id)
    with pytest.raises(InventoryError) as exc:
        inventory.approve_purchase_order(db, po.id, buyer)
    assert exc.value.status_code == 403
    assert _on_hand(db, item.id, warehouse.id) == q(0)
    inventory.approve_purchase_order(db, po.id, Actor(role='admin', employee_id='boss', name='Boss'))
    assert po.status == 'approved'
    assert _on_hand(db, item.id, warehouse.id) == q(0)


def test_transfer_tracks_stock_in_transit(db):
    item, source = _stock(db, qty=10, cost=3)
    destination = _warehouse(db, 'Branch')
    transfer = inventory.create_transfer(db, {
        'from_warehouse_id': source.id,
        'to_warehouse_id': destination.id,
        'lines': [{'stock_item_id': item.id, 'quantity': 4}],
    }, Actor())
    assert _on_hand(db, item.id, source.id) == q(10)
    inventory.dispatch_transfer(db, transfer.id, Actor(), 'dispatch-1')
    assert transfer.status == 'in_transit'
    assert _on_hand(db, item.id, source.id) == q(6)
    assert _on_hand(db, item.id, destination.id) == q(0)
    line = db.query(inventory.TransferLineModel).filter_by(transfer_id=transfer.id).one()
    assert q(line.qty_dispatched) - q(line.qty_received) == q(4)
    inventory.receive_transfer(db, transfer.id, {'idempotency_key': 'receive-1', 'lines': []}, Actor())
    assert transfer.status == 'received'
    assert _on_hand(db, item.id, source.id) == q(6)
    assert _on_hand(db, item.id, destination.id) == q(4)
    assert _on_hand(db, item.id, source.id) + _on_hand(db, item.id, destination.id) == q(10)


def test_adjustment_requires_a_reason_and_blocks_negative_stock(db):
    item, warehouse = _stock(db, qty=2, cost=6)
    with pytest.raises(InventoryError):
        inventory.adjust_stock(db, {
            'stock_item_id': item.id,
            'warehouse_id': warehouse.id,
            'direction': 'decrease',
            'quantity': 1,
            'reason': '   ',
        }, Actor())
    with pytest.raises(InventoryError):
        inventory.adjust_stock(db, {
            'stock_item_id': item.id,
            'warehouse_id': warehouse.id,
            'direction': 'decrease',
            'quantity': 5,
            'reason': 'Count correction',
            'idempotency_key': 'adj-too-much',
        }, Actor())
    assert _on_hand(db, item.id, warehouse.id) == q(2)
    inventory.adjust_stock(db, {
        'stock_item_id': item.id,
        'warehouse_id': warehouse.id,
        'direction': 'decrease',
        'quantity': 1,
        'reason': 'Damaged unit',
        'idempotency_key': 'adj-ok',
    }, Actor())
    assert _on_hand(db, item.id, warehouse.id) == q(1)


def test_reversal_restores_quantity_and_average(db):
    item, warehouse = _stock(db, qty=10, cost=5)
    txn = inventory.post_movement(
        db,
        movement_type='purchase_receipt',
        lines=[{
            'stock_item_id': item.id,
            'warehouse_id': warehouse.id,
            'qty_change': q(10),
            'unit_cost': money(15),
            'cost_effect': 'in',
        }],
        actor=Actor(),
        idempotency_key='to-reverse',
        reason='Receipt',
    )
    assert _avg(db, item.id, warehouse.id) == money(10)
    inventory.reverse_transaction(db, txn.id, 'Posted against the wrong product', Actor(), 'reversal-1')
    assert _on_hand(db, item.id, warehouse.id) == q(10)
    assert _avg(db, item.id, warehouse.id) == money(5)
    with pytest.raises(InventoryError) as exc:
        inventory.reverse_transaction(db, txn.id, 'Again', Actor(), 'reversal-2')
    assert exc.value.status_code == 409


def test_opening_backfill_runs_once(db):
    item = StockItem(
        id=str(uuid.uuid4()),
        name='Legacy valve',
        unit='Nos',
        quantity=8,
        rate=4,
        value=32,
        opening_qty=8,
        godown='Main',
        status='active',
        selling_price=0,
        tax_percent=0,
    )
    db.add(item)
    db.commit()
    inventory.backfill_opening_balances(Session)
    db.expire_all()
    balance = db.query(inventory.BalanceModel).filter_by(stock_item_id=item.id).one()
    assert q(balance.on_hand) == q(8)
    assert money(balance.avg_cost) == money(4)
    openings = db.query(inventory.TransactionModel).filter_by(movement_type='opening_balance').count()
    inventory.backfill_opening_balances(Session)
    db.expire_all()
    assert db.query(inventory.TransactionModel).filter_by(movement_type='opening_balance').count() == openings
    assert q(db.query(inventory.BalanceModel).filter_by(stock_item_id=item.id).one().on_hand) == q(8)


def test_open_alerts_are_not_duplicated(db):
    item, _warehouse = _stock(db, qty=0, cost=0, reorder_level=5)
    inventory.sync_alerts(db, item.id)
    inventory.sync_alerts(db, item.id)
    rows = db.query(inventory.AlertModel).filter(
        inventory.AlertModel.stock_item_id == item.id,
        inventory.AlertModel.alert_type == 'out_of_stock',
        inventory.AlertModel.status != 'resolved',
    ).all()
    assert len(rows) == 1
    assert q(rows[0].suggested_qty) == q(5)
