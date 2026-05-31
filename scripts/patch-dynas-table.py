#!/usr/bin/env python3
"""
Alter (patch) an existing table in a Dynas app using the Dynamic App Service API.

This script demonstrates various table schema modifications:
- Update table metadata (displayName, description)
- Add new columns
- Delete columns
- Update columns (rename, change type, change unique constraint)
- Reorder columns

Usage:
    python patch-dynas-table.py
"""

import requests
import json

# ============================================================================
# Configuration - Fill these in before running
# ============================================================================

# Choose ONE authentication method:

# Option 1: API Key (recommended for scripts) - uses X-API-Key header
API_KEY = "bz_a0XYs3Oid878h7VLt7u4344RhVIsFB0Q"

# Option 2: Bearer Token (JWT from Auth0) - uses Authorization: Bearer header
BEARER_TOKEN = None  # Set to your JWT token, or leave as None if using API_KEY

# The API base URL
API_BASE_URL = "https://ocr.boltztest.com/bz-dynas/api"

# Your app ID
APP_ID = "app_79792de3ce8c4cd793751871cfd74fdc"

# Table to patch
TABLE_NAME = "products"

# ============================================================================
# Helper: Build Auth Headers
# ============================================================================

def get_auth_headers():
    """Build authentication headers based on configured auth method."""
    headers = {"Content-Type": "application/json"}

    if API_KEY and API_KEY != "YOUR_API_KEY_HERE":
        # Use API Key authentication
        headers["X-API-Key"] = API_KEY
    elif BEARER_TOKEN:
        # Use Bearer Token authentication
        headers["Authorization"] = f"Bearer {BEARER_TOKEN}"
    else:
        raise ValueError("No authentication configured. Set either API_KEY or BEARER_TOKEN.")

    return headers


# ============================================================================
# Example 1: Update Table Metadata
# ============================================================================

def update_metadata():
    """Update table's display name and description."""
    print("\n" + "="*70)
    print("Example 1: Update table metadata")
    print("="*70)

    patch = {
        "displayName": "Product Catalog",
        "description": "Updated product catalog with enhanced inventory tracking"
    }

    url = f"{API_BASE_URL}/v1/apps/{APP_ID}/tables/{TABLE_NAME}"
    headers = get_auth_headers()

    print(f"\nPATCH {url}")
    print(f"Payload:\n{json.dumps(patch, indent=2)}")

    response = requests.patch(url, headers=headers, json=patch)

    if response.status_code == 200:
        print("\n✅ Metadata updated successfully!")
        table = response.json()
        print(f"   Display Name: {table.get('displayName')}")
        print(f"   Description: {table.get('description')}")
    else:
        print(f"\n❌ Error (Status {response.status_code})")
        print(json.dumps(response.json(), indent=2))


# ============================================================================
# Example 2: Add New Columns
# ============================================================================

def add_columns():
    """Add new columns to the table."""
    print("\n" + "="*70)
    print("Example 2: Add new columns")
    print("="*70)

    patch = {
        "addColumns": [
            {
                "name": "category",
                "displayName": "Category",
                "description": "Product category",
                "type": "text"
            },
            {
                "name": "weight",
                "displayName": "Weight",
                "description": "Product weight in kg",
                "type": "float"
            },
            {
                "name": "tags",
                "displayName": "Tags",
                "description": "Product tags as JSON array",
                "type": "json"
            }
        ]
    }

    url = f"{API_BASE_URL}/v1/apps/{APP_ID}/tables/{TABLE_NAME}"
    headers = get_auth_headers()

    print(f"\nAdding {len(patch['addColumns'])} columns...")
    print(f"Payload:\n{json.dumps(patch, indent=2)}")

    response = requests.patch(url, headers=headers, json=patch)

    if response.status_code == 200:
        print("\n✅ Columns added successfully!")
        table = response.json()
        print(f"\nCurrent columns:")
        for col in table.get('columns', []):
            print(f"  - {col['name']} ({col['type']})")
    else:
        print(f"\n❌ Error (Status {response.status_code})")
        print(json.dumps(response.json(), indent=2))


# ============================================================================
# Example 3: Update Columns (Rename, Change Type, Add Unique Constraint)
# ============================================================================

def update_columns():
    """Modify existing columns."""
    print("\n" + "="*70)
    print("Example 3: Update existing columns")
    print("="*70)

    patch = {
        "updateColumns": [
            {
                "name": "name",
                "newName": "product_name",
                "displayName": "Product Name",
                "description": "The full name of the product"
            },
            {
                "name": "price",
                "displayName": "Unit Price (USD)",
                "description": "Price per unit in US dollars"
            },
            {
                "name": "sku",
                "unique": True  # Ensure SKU is unique (if not already)
            }
        ]
    }

    url = f"{API_BASE_URL}/v1/apps/{APP_ID}/tables/{TABLE_NAME}"
    headers = get_auth_headers()

    print(f"\nUpdating columns:")
    print(f"  - Rename 'name' to 'product_name'")
    print(f"  - Update 'price' display name and description")
    print(f"  - Add unique constraint to 'sku'")
    print(f"\nPayload:\n{json.dumps(patch, indent=2)}")

    response = requests.patch(url, headers=headers, json=patch)

    if response.status_code == 200:
        print("\n✅ Columns updated successfully!")
        table = response.json()
        print(f"\nUpdated columns:")
        for col in table.get('columns', []):
            unique_marker = " [UNIQUE]" if col.get('unique') else ""
            print(f"  - {col['name']} ({col['type']}){unique_marker} - {col.get('displayName', 'N/A')}")
    else:
        print(f"\n❌ Error (Status {response.status_code})")
        print(json.dumps(response.json(), indent=2))


# ============================================================================
# Example 4: Delete Columns
# ============================================================================

def delete_columns():
    """Remove columns from the table."""
    print("\n" + "="*70)
    print("Example 4: Delete columns")
    print("="*70)

    patch = {
        "deleteColumns": ["description"]
    }

    url = f"{API_BASE_URL}/v1/apps/{APP_ID}/tables/{TABLE_NAME}"
    headers = get_auth_headers()

    print(f"\n⚠️  WARNING: This will permanently delete the 'description' column and all its data!")
    print(f"Payload:\n{json.dumps(patch, indent=2)}")

    # Uncomment to actually delete:
    # response = requests.patch(url, headers=headers, json=patch)
    #
    # if response.status_code == 200:
    #     print("\n✅ Column deleted successfully!")
    #     table = response.json()
    #     print(f"\nRemaining columns:")
    #     for col in table.get('columns', []):
    #         print(f"  - {col['name']}")
    # else:
    #     print(f"\n❌ Error (Status {response.status_code})")
    #     print(json.dumps(response.json(), indent=2))

    print("\n⏭️  Skipped (uncomment code to execute)")


# ============================================================================
# Example 5: Reorder Columns
# ============================================================================

def reorder_columns():
    """Change the display order of columns."""
    print("\n" + "="*70)
    print("Example 5: Reorder columns")
    print("="*70)

    # First, get current schema to see all column names
    url = f"{API_BASE_URL}/v1/apps/{APP_ID}/tables/{TABLE_NAME}"
    headers = get_auth_headers()

    response = requests.get(url, headers=headers)

    if response.status_code != 200:
        print(f"❌ Error fetching table schema (Status {response.status_code})")
        return

    table = response.json()
    current_columns = [col['name'] for col in table.get('columns', [])]

    print(f"\nCurrent column order:")
    for i, col_name in enumerate(current_columns, 1):
        print(f"  {i}. {col_name}")

    # Reorder: put 'sku' first, then 'id', then the rest
    new_order = []
    if 'sku' in current_columns:
        new_order.append('sku')
        current_columns.remove('sku')
    if 'id' in current_columns:
        new_order.append('id')
        current_columns.remove('id')
    new_order.extend(current_columns)

    patch = {
        "columnOrder": new_order
    }

    print(f"\nNew column order:")
    for i, col_name in enumerate(new_order, 1):
        print(f"  {i}. {col_name}")

    print(f"\nPayload:\n{json.dumps(patch, indent=2)}")

    response = requests.patch(url, headers=headers, json=patch)

    if response.status_code == 200:
        print("\n✅ Columns reordered successfully!")
    else:
        print(f"\n❌ Error (Status {response.status_code})")
        print(json.dumps(response.json(), indent=2))


# ============================================================================
# Example 6: Combined Patch (Multiple Operations)
# ============================================================================

def combined_patch():
    """Perform multiple table alterations in a single request."""
    print("\n" + "="*70)
    print("Example 6: Combined patch (multiple operations)")
    print("="*70)

    patch = {
        "displayName": "Complete Product Catalog",
        "description": "Comprehensive product catalog with inventory and pricing",
        "addColumns": [
            {
                "name": "discount",
                "displayName": "Discount %",
                "type": "float"
            }
        ],
        "updateColumns": [
            {
                "name": "quantity",
                "displayName": "Stock Quantity",
                "description": "Current quantity in warehouse"
            }
        ]
    }

    url = f"{API_BASE_URL}/v1/apps/{APP_ID}/tables/{TABLE_NAME}"
    headers = get_auth_headers()

    print(f"\nCombining multiple operations:")
    print(f"  - Update metadata")
    print(f"  - Add 'discount' column")
    print(f"  - Update 'quantity' metadata")
    print(f"\nPayload:\n{json.dumps(patch, indent=2)}")

    response = requests.patch(url, headers=headers, json=patch)

    if response.status_code == 200:
        print("\n✅ Combined patch applied successfully!")
        table = response.json()
        print(f"\nTable: {table.get('displayName')}")
        print(f"Columns ({len(table.get('columns', []))}):")
        for col in table.get('columns', []):
            print(f"  - {col['name']}: {col.get('displayName', 'N/A')}")
    else:
        print(f"\n❌ Error (Status {response.status_code})")
        print(json.dumps(response.json(), indent=2))


# ============================================================================
# Helper: Get Table Schema
# ============================================================================

def get_table_schema():
    """Fetch and display current table schema."""
    print("\n" + "="*70)
    print(f"Current schema for table '{TABLE_NAME}'")
    print("="*70)

    url = f"{API_BASE_URL}/v1/apps/{APP_ID}/tables/{TABLE_NAME}"
    headers = get_auth_headers()

    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        table = response.json()
        print(f"\nTable: {table.get('name')}")
        print(f"Display Name: {table.get('displayName')}")
        print(f"Description: {table.get('description')}")
        print(f"\nColumns ({len(table.get('columns', []))}):")
        for col in table.get('columns', []):
            unique = " [UNIQUE]" if col.get('unique') else ""
            auto = " [AUTO]" if col.get('autoGenerated') else ""
            print(f"  - {col['name']:20} {col['type']:10} {unique}{auto}")
            if col.get('displayName'):
                print(f"    Display: {col['displayName']}")
            if col.get('description'):
                print(f"    Description: {col['description']}")

        if table.get('relations'):
            print(f"\nRelations ({len(table.get('relations', []))}):")
            for rel in table['relations']:
                print(f"  - {rel['foreignKeyColumn']} -> {rel['referencesTable']}.{rel['referencesColumn']} ({rel['type']})")

        return table
    else:
        print(f"❌ Error (Status {response.status_code})")
        print(json.dumps(response.json(), indent=2))
        return None


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    print("="*70)
    print("Dynas Table Patcher")
    print("="*70)

    # Validate configuration
    if APP_ID == "YOUR_APP_ID_HERE":
        print("⚠️  Please configure APP_ID before running this script.")
        exit(1)

    if (not API_KEY or API_KEY == "YOUR_API_KEY_HERE") and not BEARER_TOKEN:
        print("⚠️  Please configure authentication before running this script.")
        print()
        print("Choose ONE authentication method:")
        print("  Option 1 (Recommended): API_KEY = 'your_api_key'")
        print("  Option 2: BEARER_TOKEN = 'your_jwt_token'")
        exit(1)

    # Show current schema
    current_schema = get_table_schema()

    if not current_schema:
        print("\n⚠️  Table does not exist or could not be fetched.")
        print(f"\nTo create the '{TABLE_NAME}' table first, run:")
        print("  python create-dynas-table.py")
        exit(1)

    print("\n" + "="*70)
    print("Choose an example to run:")
    print("="*70)
    print("1. Update metadata (displayName, description)")
    print("2. Add new columns")
    print("3. Update existing columns (rename, change metadata)")
    print("4. Delete columns")
    print("5. Reorder columns")
    print("6. Combined patch (multiple operations)")
    print("7. Show current schema")
    print()

    choice = input("Enter example number (1-7) or 'all' to run all: ").strip()

    if choice == "1":
        update_metadata()
    elif choice == "2":
        add_columns()
    elif choice == "3":
        update_columns()
    elif choice == "4":
        delete_columns()
    elif choice == "5":
        reorder_columns()
    elif choice == "6":
        combined_patch()
    elif choice == "7":
        get_table_schema()
    elif choice.lower() == "all":
        update_metadata()
        add_columns()
        update_columns()
        # Skip delete by default
        # delete_columns()
        reorder_columns()
        combined_patch()
        print("\n" + "="*70)
        print("Final schema:")
        print("="*70)
        get_table_schema()
    else:
        print("Invalid choice. Please run the script again.")

    print("\n" + "="*70)
    print("✅ Done!")
    print("="*70)
