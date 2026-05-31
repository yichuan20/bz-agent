#!/usr/bin/env python3
"""
Populate the products table with sample data.

This script inserts sample product records into the products table defined
in dynas-schema/products.json.

Usage:
    python populate-products.py
"""

import requests
import json
import random

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

# Table name
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
# Sample Product Data
# ============================================================================

SAMPLE_PRODUCTS = [
    {
        "sku": "LAPTOP-001",
        "name": "UltraBook Pro 15",
        "description": "High-performance laptop with 15-inch display, Intel i7 processor, 16GB RAM, and 512GB SSD",
        "price": 1299.99,
        "in_stock": True,
        "quantity": 45
    },
    {
        "sku": "LAPTOP-002",
        "name": "Business Elite 14",
        "description": "Lightweight business laptop with 14-inch display, perfect for professionals on the go",
        "price": 899.99,
        "in_stock": True,
        "quantity": 32
    },
    {
        "sku": "MOUSE-001",
        "name": "Wireless Precision Mouse",
        "description": "Ergonomic wireless mouse with adjustable DPI and rechargeable battery",
        "price": 49.99,
        "in_stock": True,
        "quantity": 150
    },
    {
        "sku": "KEYBOARD-001",
        "name": "Mechanical Keyboard RGB",
        "description": "Premium mechanical keyboard with customizable RGB lighting and Cherry MX switches",
        "price": 129.99,
        "in_stock": True,
        "quantity": 78
    },
    {
        "sku": "MONITOR-001",
        "name": "UltraWide 34-inch Monitor",
        "description": "34-inch curved ultrawide monitor with 3440x1440 resolution and 144Hz refresh rate",
        "price": 599.99,
        "in_stock": True,
        "quantity": 23
    },
    {
        "sku": "MONITOR-002",
        "name": "4K Professional Display 27",
        "description": "27-inch 4K monitor with 100% sRGB color accuracy, ideal for content creators",
        "price": 449.99,
        "in_stock": False,
        "quantity": 0
    },
    {
        "sku": "HEADSET-001",
        "name": "Noise-Cancelling Headset Pro",
        "description": "Premium wireless headset with active noise cancellation and 30-hour battery life",
        "price": 199.99,
        "in_stock": True,
        "quantity": 67
    },
    {
        "sku": "WEBCAM-001",
        "name": "HD Webcam 1080p",
        "description": "Full HD 1080p webcam with auto-focus and built-in dual microphones",
        "price": 79.99,
        "in_stock": True,
        "quantity": 94
    },
    {
        "sku": "DOCK-001",
        "name": "Universal USB-C Docking Station",
        "description": "Multi-port docking station with dual 4K display support and 100W power delivery",
        "price": 249.99,
        "in_stock": True,
        "quantity": 41
    },
    {
        "sku": "TABLET-001",
        "name": "Pro Tablet 12.9",
        "description": "12.9-inch professional tablet with stylus support and 256GB storage",
        "price": 799.99,
        "in_stock": True,
        "quantity": 28
    },
    {
        "sku": "CHARGER-001",
        "name": "65W USB-C Fast Charger",
        "description": "Compact 65W USB-C charger with GaN technology and foldable plug",
        "price": 39.99,
        "in_stock": True,
        "quantity": 200
    },
    {
        "sku": "CABLE-001",
        "name": "Braided USB-C Cable 2m",
        "description": "Durable braided USB-C to USB-C cable, supports 100W charging and USB 3.2 speeds",
        "price": 19.99,
        "in_stock": True,
        "quantity": 350
    },
    {
        "sku": "STAND-001",
        "name": "Adjustable Laptop Stand",
        "description": "Aluminum laptop stand with adjustable height and angle, fits 10-17 inch laptops",
        "price": 54.99,
        "in_stock": True,
        "quantity": 112
    },
    {
        "sku": "BACKPACK-001",
        "name": "Tech Backpack with USB Port",
        "description": "Water-resistant backpack with padded laptop compartment and built-in USB charging port",
        "price": 69.99,
        "in_stock": True,
        "quantity": 88
    },
    {
        "sku": "SPEAKER-001",
        "name": "Bluetooth Speaker Pro",
        "description": "Portable Bluetooth speaker with 360-degree sound and 20-hour battery life",
        "price": 89.99,
        "in_stock": False,
        "quantity": 0
    },
    {
        "sku": "SSD-001",
        "name": "Portable SSD 1TB",
        "description": "Ultra-fast portable SSD with USB 3.2 Gen 2 and up to 1050MB/s read speeds",
        "price": 139.99,
        "in_stock": True,
        "quantity": 156
    },
    {
        "sku": "HUB-001",
        "name": "7-Port USB Hub",
        "description": "Powered USB 3.0 hub with 7 ports and individual on/off switches",
        "price": 34.99,
        "in_stock": True,
        "quantity": 175
    },
    {
        "sku": "LIGHT-001",
        "name": "LED Desk Lamp with USB",
        "description": "Adjustable LED desk lamp with touch controls, wireless charging, and USB port",
        "price": 44.99,
        "in_stock": True,
        "quantity": 63
    },
    {
        "sku": "PRINTER-001",
        "name": "Wireless All-in-One Printer",
        "description": "Compact wireless printer with scanning, copying, and mobile printing support",
        "price": 179.99,
        "in_stock": True,
        "quantity": 19
    },
    {
        "sku": "ROUTER-001",
        "name": "WiFi 6 Router AX3000",
        "description": "Dual-band WiFi 6 router with speeds up to 3000Mbps and coverage up to 2500 sq ft",
        "price": 149.99,
        "in_stock": True,
        "quantity": 34
    }
]


# ============================================================================
# Insert Records
# ============================================================================

def insert_product(product):
    """Insert a single product record."""
    url = f"{API_BASE_URL}/v1/apps/{APP_ID}/tables/{TABLE_NAME}/records"
    headers = get_auth_headers()

    response = requests.post(url, headers=headers, json=product)

    if response.status_code == 201:
        created = response.json()
        return created
    else:
        print(f"  ❌ Failed to insert {product['name']}")
        print(f"     Error: {response.json()}")
        return None


def populate_products(products=None, clear_existing=False):
    """Populate the products table with sample data."""

    if products is None:
        products = SAMPLE_PRODUCTS

    print("="*70)
    print("Populating Products Table")
    print("="*70)
    print()

    # Optional: Clear existing records
    if clear_existing:
        print("⚠️  Clearing existing products...")
        url = f"{API_BASE_URL}/v1/apps/{APP_ID}/tables/{TABLE_NAME}/records"
        headers = get_auth_headers()

        # Get all existing records
        response = requests.get(url, headers=headers, params={"limit": 1000})
        if response.status_code == 200:
            existing = response.json().get('data', [])
            for record in existing:
                delete_url = f"{url}/{record['id']}"
                requests.delete(delete_url, headers=headers)
            print(f"  Deleted {len(existing)} existing records\n")

    # Insert new records
    print(f"Inserting {len(products)} products...\n")

    inserted_count = 0
    failed_count = 0

    for i, product in enumerate(products, 1):
        result = insert_product(product)
        if result:
            inserted_count += 1
            stock_status = "✓ In Stock" if product['in_stock'] else "✗ Out of Stock"
            print(f"  {i:2d}. ✅ {product['name']}")
            print(f"      SKU: {product['sku']} | Price: ${product['price']:.2f} | {stock_status}")
        else:
            failed_count += 1

    print()
    print("="*70)
    print(f"✅ Inserted: {inserted_count} products")
    if failed_count > 0:
        print(f"❌ Failed:   {failed_count} products")
    print("="*70)


# ============================================================================
# Generate Random Products
# ============================================================================

def generate_random_products(count=10):
    """Generate random product data for testing."""

    categories = ["Electronics", "Accessories", "Office", "Storage", "Audio", "Video"]
    adjectives = ["Pro", "Premium", "Ultra", "Elite", "Advanced", "Smart", "Compact"]
    products = ["Laptop", "Mouse", "Keyboard", "Monitor", "Tablet", "Phone", "Camera", "Speaker"]

    random_products = []

    for i in range(count):
        category = random.choice(categories)
        adjective = random.choice(adjectives)
        product_type = random.choice(products)

        sku = f"{category[:3].upper()}-{random.randint(1000, 9999)}"
        name = f"{adjective} {product_type}"
        description = f"High-quality {product_type.lower()} for professional use"
        price = round(random.uniform(29.99, 1999.99), 2)
        in_stock = random.choice([True, True, True, False])  # 75% in stock
        quantity = random.randint(0, 200) if in_stock else 0

        random_products.append({
            "sku": sku,
            "name": name,
            "description": description,
            "price": price,
            "in_stock": in_stock,
            "quantity": quantity
        })

    return random_products


# ============================================================================
# View Inserted Products
# ============================================================================

def view_products():
    """Fetch and display all products from the table."""
    url = f"{API_BASE_URL}/v1/apps/{APP_ID}/tables/{TABLE_NAME}/records"
    headers = get_auth_headers()

    response = requests.get(url, headers=headers, params={"limit": 1000, "sort": "sku:asc"})

    if response.status_code == 200:
        data = response.json()
        products = data.get('data', [])
        total = data.get('pagination', {}).get('total', 0)

        print()
        print("="*70)
        print(f"Current Products in Table ({total} total)")
        print("="*70)
        print()

        if not products:
            print("  No products found.\n")
            return

        for product in products:
            stock = "✓" if product['in_stock'] else "✗"
            print(f"  [{product['id']:3d}] {product['name']:35s} ${product['price']:8.2f} {stock}")
            print(f"        SKU: {product['sku']:15s} Qty: {product['quantity']:3d}")

        print()
    else:
        print(f"❌ Error fetching products: {response.json()}")


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    print()
    print("="*70)
    print("Products Table Populator")
    print("="*70)
    print()

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

    print("Choose an option:")
    print()
    print("1. Insert sample products (20 predefined items)")
    print("2. Generate and insert random products")
    print("3. Clear all products and insert sample data")
    print("4. View current products")
    print()

    choice = input("Enter option (1-4): ").strip()

    if choice == "1":
        populate_products()
        view_products()
    elif choice == "2":
        count = input("How many random products to generate? (default: 10): ").strip()
        count = int(count) if count.isdigit() else 10
        random_products = generate_random_products(count)
        populate_products(random_products)
        view_products()
    elif choice == "3":
        confirm = input("⚠️  This will DELETE all existing products. Continue? (yes/no): ").strip().lower()
        if confirm == "yes":
            populate_products(clear_existing=True)
            view_products()
        else:
            print("Cancelled.")
    elif choice == "4":
        view_products()
    else:
        print("Invalid choice.")
        exit(1)

    print()
