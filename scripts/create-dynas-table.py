#!/usr/bin/env python3
"""
Create a new table in a Dynas app using the Dynamic App Service API.

Usage:
    python create-dynas-table.py
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
# Table Definition
# ============================================================================

table_schema = {
    "name": "products",
    "displayName": "Products",
    "description": "Product catalog with pricing and inventory information",
    "columns": [
        {
            "name": "sku",
            "displayName": "SKU",
            "description": "Stock-keeping unit - unique product identifier",
            "type": "text",
            "unique": True
        },
        {
            "name": "name",
            "displayName": "Product Name",
            "description": "Display name of the product",
            "type": "text"
        },
        {
            "name": "description",
            "displayName": "Description",
            "description": "Product description",
            "type": "text"
        },
        {
            "name": "price",
            "displayName": "Price",
            "description": "Product price in USD",
            "type": "float"
        },
        {
            "name": "in_stock",
            "displayName": "In Stock",
            "description": "Whether the product is currently in stock",
            "type": "boolean"
        },
        {
            "name": "quantity",
            "displayName": "Quantity",
            "description": "Number of items in stock",
            "type": "integer"
        }
    ]
}

# ============================================================================
# Create Table
# ============================================================================

def create_table():
    """Create a table in the Dynas app."""

    # API endpoint
    url = f"{API_BASE_URL}/v1/apps/{APP_ID}/tables"

    # Request headers
    headers = get_auth_headers()

    # Make the request
    print(f"Creating table '{table_schema['name']}'...")
    print(f"API URL: {url}")
    print(f"\n🔑 Authentication headers being sent:")
    print(f"   Headers: {headers}")
    print(f"\nTable schema:")
    print(json.dumps(table_schema, indent=2))
    print()

    try:
        response = requests.post(url, headers=headers, json=table_schema)

        # Check response
        if response.status_code == 201:
            print("✅ Table created successfully!")
            print("\nResponse:")
            print(json.dumps(response.json(), indent=2))
            return response.json()
        else:
            print(f"❌ Error creating table (Status {response.status_code})")
            print("\nError details:")
            print(json.dumps(response.json(), indent=2))
            return None

    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        return None


def list_tables():
    """List all tables in the app."""

    url = f"{API_BASE_URL}/v1/apps/{APP_ID}/tables"

    headers = get_auth_headers()

    try:
        response = requests.get(url, headers=headers)

        if response.status_code == 200:
            print("\n📋 Current tables in the app:")
            tables = response.json().get('data', [])
            for table in tables:
                print(f"  - {table['name']} ({table.get('displayName', 'N/A')})")
            return tables
        else:
            print(f"❌ Error listing tables (Status {response.status_code})")
            return None

    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        return None


# ============================================================================
# Example: Create a table with relations (Foreign Keys)
# ============================================================================

def create_table_with_relations():
    """
    Example of creating two related tables:
    1. categories (parent)
    2. gallery_items (child with FK to categories)
    """

    # First create the parent table (categories)
    categories_schema = {
        "name": "categories",
        "displayName": "Categories",
        "description": "Content categories with unique slugs",
        "columns": [
            {
                "name": "label",
                "displayName": "Label",
                "description": "Display name of the category",
                "type": "text"
            },
            {
                "name": "slug",
                "displayName": "Slug",
                "description": "URL-friendly identifier",
                "type": "text",
                "unique": True
            }
        ]
    }

    # Then create the child table with a foreign key relation
    gallery_items_schema = {
        "name": "gallery_items",
        "displayName": "Gallery Items",
        "description": "Images in the gallery, each linked to a category",
        "columns": [
            {
                "name": "title",
                "displayName": "Title",
                "type": "text"
            },
            {
                "name": "category_slug",
                "displayName": "Category Slug",
                "description": "References categories.slug",
                "type": "text"
            },
            {
                "name": "image_url",
                "displayName": "Image URL",
                "type": "text"
            },
            {
                "name": "year",
                "displayName": "Year",
                "type": "text"
            }
        ],
        "relations": [
            {
                "type": "many-to-one",
                "foreignKeyColumn": "category_slug",
                "referencesTable": "categories",
                "referencesColumn": "slug"
            }
        ]
    }

    url = f"{API_BASE_URL}/v1/apps/{APP_ID}/tables"
    headers = get_auth_headers()

    # Create categories table
    print("Creating 'categories' table...")
    response1 = requests.post(url, headers=headers, json=categories_schema)
    if response1.status_code == 201:
        print("✅ Categories table created")
    else:
        print(f"❌ Failed to create categories table: {response1.json()}")
        return

    # Create gallery_items table with FK relation
    print("Creating 'gallery_items' table with foreign key...")
    response2 = requests.post(url, headers=headers, json=gallery_items_schema)
    if response2.status_code == 201:
        print("✅ Gallery items table created with foreign key to categories")
        print(json.dumps(response2.json(), indent=2))
    else:
        print(f"❌ Failed to create gallery_items table: {response2.json()}")


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    print("=" * 70)
    print("Dynas Table Creator")
    print("=" * 70)
    print()

    # Validate configuration
    if APP_ID == "YOUR_APP_ID_HERE":
        print("⚠️  Please configure APP_ID before running this script.")
        print()
        print("Edit the script and set:")
        print("  - APP_ID: Your Dynas app ID")
        exit(1)

    if (not API_KEY or API_KEY == "YOUR_API_KEY_HERE") and not BEARER_TOKEN:
        print("⚠️  Please configure authentication before running this script.")
        print()
        print("Choose ONE authentication method:")
        print("  Option 1 (Recommended): API_KEY = 'your_api_key'")
        print("  Option 2: BEARER_TOKEN = 'your_jwt_token'")
        exit(1)

    # Create the table
    result = create_table()

    if result:
        # List all tables
        list_tables()

    print()
    print("=" * 70)
    print()
    print("💡 To create tables with relations, uncomment:")
    print("   # create_table_with_relations()")
    print()

    # Uncomment to create example tables with foreign keys:
    # create_table_with_relations()
