#!/usr/bin/env python3
"""
Cleanup script to fix unrealistic vehicle meter readings and fuel consumption values
Removes or corrects data where meter readings exceed 1,000,000 km
"""

import os
import sys
from sqlalchemy import create_engine, Column, String, Float, Integer, DateTime, ForeignKey
from sqlalchemy.orm import sessionmaker, declarative_base
from datetime import datetime, timezone

# Add parent directory to path
sys.path.insert(0, os.path.dirname(__file__))

# Database setup
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///crm_db.sqlite3')
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if 'sqlite' in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Import models
from server import VehicleUsageModel, FuelExpenseClaimModel, VehicleModel

def cleanup_vehicle_usage_data():
    """Clean up unrealistic vehicle usage data"""
    db = SessionLocal()
    try:
        print("🧹 Cleaning up vehicle usage data...")
        
        # Find bad records
        bad_usages = db.query(VehicleUsageModel).filter(
            (VehicleUsageModel.start_meter_reading > 1000000) | 
            (VehicleUsageModel.end_meter_reading > 1000000)
        ).all()
        
        if bad_usages:
            print(f"  Found {len(bad_usages)} records with unrealistic meter readings")
            for usage in bad_usages:
                print(f"    - Usage ID: {usage.id}")
                print(f"      Start: {usage.start_meter_reading}, End: {usage.end_meter_reading}")
                print(f"      KM Driven: {usage.km_driven}, Fuel: {usage.fuel_consumed}")
                
                # Delete the bad record
                db.delete(usage)
            
            db.commit()
            print(f"  ✓ Deleted {len(bad_usages)} bad vehicle usage records")
        else:
            print("  ✓ No bad meter readings found")
        
        # Check for records with negative or zero km driven
        print("\n  Checking for zero/negative km records...")
        bad_km = db.query(VehicleUsageModel).filter(
            (VehicleUsageModel.km_driven <= 0) |
            (VehicleUsageModel.km_driven > 999999)
        ).all()
        
        if bad_km:
            print(f"  Found {len(bad_km)} records with unrealistic km values")
            for usage in bad_km:
                print(f"    - Usage ID: {usage.id}, KM: {usage.km_driven}")
                db.delete(usage)
            
            db.commit()
            print(f"  ✓ Deleted {len(bad_km)} records with bad km values")
        else:
            print("  ✓ No bad km values found")
            
    except Exception as e:
        print(f"  ✗ Error cleaning vehicle usage data: {e}")
        db.rollback()
    finally:
        db.close()

def cleanup_fuel_claims_data():
    """Clean up fuel claims with bad data"""
    db = SessionLocal()
    try:
        print("\n🧹 Cleaning up fuel claims data...")
        
        # Find claims related to deleted usages
        bad_claims = db.query(FuelExpenseClaimModel).filter(
            (FuelExpenseClaimModel.fuel_consumed > 999999) |
            (FuelExpenseClaimModel.km_driven > 999999)
        ).all()
        
        if bad_claims:
            print(f"  Found {len(bad_claims)} claims with unrealistic values")
            for claim in bad_claims:
                print(f"    - Claim ID: {claim.id}, Fuel: {claim.fuel_consumed}, KM: {claim.km_driven}")
                db.delete(claim)
            
            db.commit()
            print(f"  ✓ Deleted {len(bad_claims)} bad fuel claims")
        else:
            print("  ✓ No bad claims found")
            
    except Exception as e:
        print(f"  ✗ Error cleaning fuel claims: {e}")
        db.rollback()
    finally:
        db.close()

def reset_vehicle_meter_readings():
    """Reset vehicle meter readings that are unrealistic"""
    db = SessionLocal()
    try:
        print("\n🧹 Resetting unrealistic vehicle meter readings...")
        
        bad_vehicles = db.query(VehicleModel).filter(
            VehicleModel.current_meter_reading > 1000000
        ).all()
        
        if bad_vehicles:
            print(f"  Found {len(bad_vehicles)} vehicles with unrealistic meter readings")
            for vehicle in bad_vehicles:
                print(f"    - Vehicle: {vehicle.vehicle_name}, Current Reading: {vehicle.current_meter_reading}")
                vehicle.current_meter_reading = 0  # Reset to 0
                db.add(vehicle)
            
            db.commit()
            print(f"  ✓ Reset {len(bad_vehicles)} vehicle meter readings to 0")
        else:
            print("  ✓ No vehicles with bad meter readings found")
            
    except Exception as e:
        print(f"  ✗ Error resetting vehicle meter readings: {e}")
        db.rollback()
    finally:
        db.close()

def main():
    """Run all cleanup operations"""
    print("=" * 60)
    print("Vehicle Data Cleanup Tool")
    print("=" * 60)
    print(f"Database: {DATABASE_URL}\n")
    
    cleanup_vehicle_usage_data()
    cleanup_fuel_claims_data()
    reset_vehicle_meter_readings()
    
    print("\n" + "=" * 60)
    print("✓ Cleanup complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()
