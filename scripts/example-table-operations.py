#!/usr/bin/env python3
"""
Example operations on a Dynas table: create, insert, query, update, delete.

This demonstrates the full CRUD lifecycle using the Dynamic App Service API.
"""

import requests
import json

# ============================================================================
# Configuration
# ============================================================================

# Choose ONE authentication method:

# Option 1: API Key (recommended for scripts) - uses X-API-Key header
API_KEY = "YOUR_API_KEY_HERE"

# Option 2: Bearer Token (JWT from Auth0) - uses Authorization: Bearer header
BEARER_TOKEN = None  # Set to your JWT token, or leave as None if using API_KEY

API_BASE_URL = "https://test.boltzhub.com/bz-appstore-api/v1/bz-dynas/api"
APP_ID = "YOUR_APP_ID_HERE"

# ============================================================================
# Helper Functions
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


def make_request(method, endpoint, data=None, debug=False):
    """Make an authenticated request to the API."""
    url = f"{API_BASE_URL}{endpoint}"
    headers = get_auth_headers()

    if debug:
        print(f"\n🔍 DEBUG: {method} {url}")
        print(f"   Headers: {headers}")

    if method == "GET":
        response = requests.get(url, headers=headers)
    elif method == "POST":
        response = requests.post(url, headers=headers, json=data)
    elif method == "PATCH":
        response = requests.patch(url, headers=headers, json=data)
    elif method == "DELETE":
        response = requests.delete(url, headers=headers)
    else:
        raise ValueError(f"Unsupported method: {method}")

    return response


# ============================================================================
# 1. Create Table
# ============================================================================

def create_products_table():
    """Create a products table."""
    print("\n" + "="*70)
    print("1. Creating 'products' table")
    print("="*70)

    table_schema = {
        "name": "products",
        "displayName": "Products",
        "description": "Product catalog",
        "columns": [
            {"name": "sku", "type": "text", "unique": True, "displayName": "SKU"},
            {"name": "name", "type": "text", "displayName": "Product Name"},
            {"name": "price", "type": "float", "displayName": "Price"},
            {"name": "in_stock", "type": "boolean", "displayName": "In Stock"},
            {"name": "quantity", "type": "integer", "displayName": "Quantity"}
        ]
    }

    response = make_request("POST", f"/v1/apps/{APP_ID}/tables", table_schema)

    if response.status_code == 201:
        print("✅ Table created successfully")
        return True
    elif response.status_code == 409:
        print("⚠️  Table already exists, continuing...")
        return True
    else:
        print(f"❌ Error: {response.json()}")
        return False


# ============================================================================
# 2. Insert Records
# ============================================================================

def insert_records():
    """Insert sample product records."""
    print("\n" + "="*70)
    print("2. Inserting records")
    print("="*70)

    products = [
        {"sku": "WIDGET-001", "name": "Blue Widget", "price": 19.99, "in_stock": True, "quantity": 100},
        {"sku": "GADGET-002", "name": "Red Gadget", "price": 29.99, "in_stock": True, "quantity": 50},
        {"sku": "TOOL-003", "name": "Green Tool", "price": 39.99, "in_stock": False, "quantity": 0},
    ]

    inserted_ids = []
    for product in products:
        response = make_request("POST", f"/v1/apps/{APP_ID}/tables/products/records", product)

        if response.status_code == 201:
            record = response.json()
            inserted_ids.append(record['id'])
            print(f"  ✅ Inserted: {product['name']} (ID: {record['id']})")
        else:
            print(f"  ❌ Failed to insert {product['name']}: {response.json()}")

    return inserted_ids


# ============================================================================
# 3. Query Records
# ============================================================================

def query_records():
    """Query and filter records."""
    print("\n" + "="*70)
    print("3. Querying records")
    print("="*70)

    # Get all records
    print("\n📋 All products:")
    response = make_request("GET", f"/v1/apps/{APP_ID}/tables/products/records")

    if response.status_code == 200:
        data = response.json()
        for record in data['data']:
            stock_status = "✓ In Stock" if record['in_stock'] else "✗ Out of Stock"
            print(f"  - {record['name']} (${record['price']}) - {stock_status}")

    # Filter: Only in-stock products
    print("\n🟢 In-stock products:")
    filter_params = {
        "filter": json.dumps({"field": "in_stock", "op": "eq", "value": True})
    }
    response = requests.get(
        f"{API_BASE_URL}/v1/apps/{APP_ID}/tables/products/records",
        headers=get_auth_headers(),
        params=filter_params
    )

    if response.status_code == 200:
        data = response.json()
        for record in data['data']:
            print(f"  - {record['name']} (Qty: {record['quantity']})")

    # Filter: Price > 25
    print("\n💰 Products over $25:")
    filter_params = {
        "filter": json.dumps({"field": "price", "op": "gt", "value": 25})
    }
    response = requests.get(
        f"{API_BASE_URL}/v1/apps/{APP_ID}/tables/products/records",
        headers=get_auth_headers(),
        params=filter_params
    )

    if response.status_code == 200:
        data = response.json()
        for record in data['data']:
            print(f"  - {record['name']} (${record['price']})")


# ============================================================================
# 4. Update Records
# ============================================================================

def update_record(record_id):
    """Update a specific record."""
    print("\n" + "="*70)
    print(f"4. Updating record ID {record_id}")
    print("="*70)

    update_data = {
        "quantity": 150,
        "price": 24.99
    }

    response = make_request(
        "PATCH",
        f"/v1/apps/{APP_ID}/tables/products/records/{record_id}",
        update_data
    )

    if response.status_code == 200:
        record = response.json()
        print(f"✅ Updated: {record['name']}")
        print(f"   New price: ${record['price']}")
        print(f"   New quantity: {record['quantity']}")
    else:
        print(f"❌ Update failed: {response.json()}")


# ============================================================================
# 5. SQL Query
# ============================================================================

def execute_sql_query():
    """Execute a raw SQL query."""
    print("\n" + "="*70)
    print("5. Executing SQL query")
    print("="*70)

    sql_query = {
        "query": "SELECT name, price, quantity FROM products WHERE in_stock = $1 ORDER BY price DESC",
        "params": [True],
        "readonly": True
    }

    response = make_request("POST", f"/v1/apps/{APP_ID}/tables/query", sql_query)

    if response.status_code == 200:
        data = response.json()
        print(f"\n📊 SQL Query Results ({len(data['data'])} rows):")
        print(f"   Execution time: {data.get('executionTime', 'N/A')} ms\n")
        for row in data['data']:
            print(f"   {row['name']:20} ${row['price']:6.2f}  (Qty: {row['quantity']})")
    else:
        print(f"❌ Query failed: {response.json()}")


# ============================================================================
# 6. Aggregate Data
# ============================================================================

def aggregate_data():
    """Perform aggregation queries."""
    print("\n" + "="*70)
    print("6. Aggregating data")
    print("="*70)

    agg_query = {
        "aggregations": [
            {"function": "count"},
            {"function": "avg", "field": "price"},
            {"function": "sum", "field": "quantity"},
            {"function": "max", "field": "price"},
            {"function": "min", "field": "price"}
        ]
    }

    response = make_request("POST", f"/v1/apps/{APP_ID}/tables/products/aggregate", agg_query)

    if response.status_code == 200:
        data = response.json()
        result = data['data']
        print("\n📊 Aggregate Results:")
        print(f"   Total products: {result.get('count', 0)}")
        print(f"   Average price:  ${result.get('avg_price', 0):.2f}")
        print(f"   Total quantity: {result.get('sum_quantity', 0)}")
        print(f"   Max price:      ${result.get('max_price', 0):.2f}")
        print(f"   Min price:      ${result.get('min_price', 0):.2f}")
    else:
        print(f"❌ Aggregation failed: {response.json()}")


# ============================================================================
# 7. Delete Record
# ============================================================================

def delete_record(record_id):
    """Delete a specific record."""
    print("\n" + "="*70)
    print(f"7. Deleting record ID {record_id}")
    print("="*70)

    response = make_request("DELETE", f"/v1/apps/{APP_ID}/tables/products/records/{record_id}")

    if response.status_code == 200:
        print(f"✅ Record {record_id} deleted successfully")
    else:
        print(f"❌ Delete failed: {response.json()}")


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    print("="*70)
    print("Dynas Table Operations Example")
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

    # Run all operations
    if create_products_table():
        inserted_ids = insert_records()

        query_records()

        if inserted_ids:
            update_record(inserted_ids[0])

        execute_sql_query()

        aggregate_data()

        # Optionally delete one record
        # if inserted_ids:
        #     delete_record(inserted_ids[-1])

    print("\n" + "="*70)
    print("✅ All operations completed!")
    print("="*70 + "\n")
