"""Load the three Business Potential Excel files into business_potential_records."""
from server import SessionLocal, BusinessPotentialRecordModel
from business_potential_data import import_business_potential_records

if __name__ == '__main__':
    db = SessionLocal()
    try:
        result = import_business_potential_records(db, BusinessPotentialRecordModel, replace=True)
        total = db.query(BusinessPotentialRecordModel).count()
        print(result)
        print('total_rows', total)
    finally:
        db.close()
