# Inventory stock management

Stock Management is a module inside the existing CRM. It uses the same login, roles, and `stock-management` permission. The customer-order Inventory screen is unchanged. Lead and carry-order material lines can still pick a stock item, and they do not change on-hand quantity.

## Stock rules

Available stock = on-hand − reserved − damaged.

Incoming purchase quantity and in-transit transfer quantity are not available.

On-hand quantity and average cost change only when a ledger transaction is posted. Editing a product does not change them. Posted ledger rows are not deleted. A correction is a reversal, which posts the opposite movement and keeps the original line.

Weighted average cost, applied when stock comes in:

`(on-hand × average cost + received quantity × unit cost) / (on-hand + received quantity)`

When on-hand is zero, the incoming unit cost becomes the average. An issue or decrease uses the current average and does not change it. Reversing a receipt removes that receipt's cost from the average.

Purchase orders do not increase on-hand stock. Approving an order increases incoming quantity. On-hand stock increases only when a goods receipt is posted, and each receipt posts once. The same idempotency key or the same supplier delivery reference on one order is rejected.

A transfer does not create or destroy stock. Dispatch reduces the source warehouse and keeps the quantity in transit. The destination increases only when receipt is confirmed.

Negative stock is rejected unless an administrator turns it on from the stock overview. The setting is stored as `inventory.allow_negative` in `app_settings`.

Suggested reorder quantity = reorder target − on-hand − incoming + reserved, and never below zero. The target is the preferred reorder quantity when it is set, otherwise the reorder level, otherwise minimum stock. An open alert is unique for the same product, warehouse, and alert type.

## Values that are not interchangeable

- Cost value is on-hand quantity × weighted average cost.
- Selling value is on-hand quantity × the current selling price.
- Purchase order total is the committed purchase amount.
- None of these is sales revenue or profit. This release does not calculate profit.

## Existing stock items

On startup, each current `stock_items` row that does not yet have a balance is given a warehouse from its godown name, or Default. If its quantity is not zero, one opening ledger entry is posted. Running startup again does not post that opening twice. The lead lookup still returns `id`, `name`, `item_code`, `stock_group`, `unit`, `quantity`, and `godown`. `quantity` is the total on-hand cache.

## What this release does not include

Sales orders, invoices, customer returns, serial and batch tracking, expiry dates, FIFO costing, product variants, barcode images, email notifications, PDF documents, and a separate user or role module. Those CRM areas stay as they are.

## Tests

From `backend`, with the application dependencies installed:

```bash
python -m pytest test_inventory.py -q
```

The tests use a temporary SQLite database. They do not connect to the CRM database.
