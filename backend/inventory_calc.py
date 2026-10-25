"""Decimal-safe inventory calculations.

Available stock = on-hand − reserved − damaged.
Incoming and in-transit quantities are not available.

Weighted average on an inbound receipt:
    (on_hand * average_cost + received_qty * unit_cost) / (on_hand + received_qty)
When on-hand is zero, the receipt cost becomes the average.

Suggested reorder = reorder target − on-hand − incoming + reserved, minimum 0.
The reorder target is the preferred reorder quantity when it is set,
otherwise the reorder level, otherwise the minimum stock level.
"""
from decimal import Decimal, ROUND_HALF_UP

QTY_Q = Decimal('0.001')
MONEY_Q = Decimal('0.01')


def to_decimal(value, default='0') -> Decimal:
    if isinstance(value, Decimal):
        return value
    if value is None or value == '':
        return Decimal(default)
    return Decimal(str(value))


def q(value) -> Decimal:
    return to_decimal(value).quantize(QTY_Q, rounding=ROUND_HALF_UP)


def money(value) -> Decimal:
    return to_decimal(value).quantize(MONEY_Q, rounding=ROUND_HALF_UP)


def available(on_hand, reserved, damaged) -> Decimal:
    return q(q(on_hand) - q(reserved) - q(damaged))


def weighted_average(on_hand, avg_cost, incoming_qty, incoming_cost) -> Decimal:
    on_hand = q(on_hand)
    incoming_qty = q(incoming_qty)
    total = on_hand + incoming_qty
    if total <= 0:
        return money(incoming_cost if incoming_qty else avg_cost)
    value = (on_hand * to_decimal(avg_cost)) + (incoming_qty * to_decimal(incoming_cost))
    return (value / total).quantize(MONEY_Q, rounding=ROUND_HALF_UP)


def average_after_removal(on_hand, avg_cost, remove_qty, remove_cost) -> Decimal:
    """Remove a cost layer. A zero balance keeps the last average for display."""
    on_hand = q(on_hand)
    remove_qty = q(remove_qty)
    left = on_hand - remove_qty
    if left <= 0:
        return money(avg_cost)
    value = (on_hand * to_decimal(avg_cost)) - (remove_qty * to_decimal(remove_cost))
    if value < 0:
        value = Decimal('0')
    return (value / left).quantize(MONEY_Q, rounding=ROUND_HALF_UP)


def suggested_reorder(reorder_target, on_hand, incoming, reserved) -> Decimal:
    raw = (
        to_decimal(reorder_target)
        - to_decimal(on_hand)
        - to_decimal(incoming)
        + to_decimal(reserved)
    )
    if raw < 0:
        return q(0)
    return q(raw)
