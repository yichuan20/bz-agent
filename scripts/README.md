# Dynas Table Creator Script

Python script to create tables in your Dynas app using the Dynamic App Service API.

## Prerequisites

```bash
pip install requests
```

## Configuration

Edit `create-dynas-table.py` and fill in:

1. **Choose ONE authentication method:**
   - **API_KEY** (Recommended for scripts) - Uses `X-API-Key` header
   - **BEARER_TOKEN** (JWT from Auth0) - Uses `Authorization: Bearer` header

2. **APP_ID** - Your Dynas app ID (e.g., `app_abc123`)

```python
# Option 1: API Key (recommended for scripts)
API_KEY = "bz_abc123..."

# Option 2: Bearer Token (leave as None if using API_KEY)
BEARER_TOKEN = None  # Or set to your JWT token

APP_ID = "app_abc123"  # Your app ID
```

### Getting Your Credentials

#### Option 1: API Key (Recommended)
Generate an API key from your Dynas dashboard or admin panel. The key will start with `bz_`.

```python
API_KEY = "bz_a0XYs3Oid878h7VLt7u4344RhVIsFB0Q"
BEARER_TOKEN = None
```

#### Option 2: Bearer Token (JWT)
From your browser's local storage after logging in:
```javascript
localStorage.getItem('accessToken')
```

```python
API_KEY = None  # Or leave as "YOUR_API_KEY_HERE"
BEARER_TOKEN = "eyJhbGciOiJSUzI1NiIs..."
```

#### Getting App ID
From the `.env` file in this project:
```bash
cat ../.env | grep VITE_DYNAS_APP_ID
```

## Usage

### Basic Usage - Create a Simple Table

```bash
python create-dynas-table.py
```

This creates a `products` table with columns:
- `sku` (text, unique)
- `name` (text)
- `description` (text)
- `price` (float)
- `in_stock` (boolean)
- `quantity` (integer)

### Customize the Table Schema

Edit the `table_schema` dictionary in the script:

```python
table_schema = {
    "name": "your_table_name",
    "displayName": "Your Table Name",
    "description": "Table description",
    "columns": [
        {
            "name": "column_name",
            "displayName": "Column Display Name",
            "description": "What this column stores",
            "type": "text",  # text, integer, float, boolean, date, datetime, time, json, blob
            "unique": False  # Set to True for unique constraint
        }
    ]
}
```

### Create Tables with Relations (Foreign Keys)

Uncomment the last line in the script:

```python
# create_table_with_relations()
```

This creates:
1. **categories** table with a unique `slug` column
2. **gallery_items** table with a foreign key to `categories.slug`

## Available Column Types

From the OpenAPI spec:

| Type | Description | Example |
|------|-------------|---------|
| `text` | String/text | `"Hello World"` |
| `integer` | Whole numbers | `42` |
| `float` | Decimal numbers | `19.99` |
| `boolean` | True/false | `true` |
| `date` | Date only | `"2025-08-01"` |
| `datetime` | Date with time | `"2025-08-04T09:49:00Z"` |
| `time` | Time only | `"14:30:00"` |
| `json` | JSON object | `{"key": "value"}` |
| `blob` | Binary data | (binary) |

## API Endpoints Used

- **POST** `/v1/apps/{appId}/tables` - Create a table
- **GET** `/v1/apps/{appId}/tables` - List all tables
- **GET** `/v1/apps/{appId}/tables/{tableName}` - Get table schema
- **DELETE** `/v1/apps/{appId}/tables/{tableName}` - Delete a table

## Example Output

```
======================================================================
Dynas Table Creator
======================================================================

Creating table 'products'...
API URL: https://test.boltzhub.com/bz-appstore-api/v1/bz-dynas/api/v1/apps/app_abc123/tables

Table schema:
{
  "name": "products",
  "displayName": "Products",
  "description": "Product catalog with pricing and inventory information",
  "columns": [...]
}

✅ Table created successfully!

Response:
{
  "name": "products",
  "displayName": "Products",
  "columns": [...]
}

📋 Current tables in the app:
  - products (Products)
  - categories (Categories)

======================================================================
```

## Authentication Methods

The API supports two authentication methods:

### 1. API Key (Recommended for Scripts)
- **Header**: `X-API-Key: bz_abc123...`
- **Use when**: Running automated scripts, CI/CD, scheduled tasks
- **Advantages**: Doesn't expire, easier to manage
- **Format**: Starts with `bz_`

### 2. Bearer Token (JWT)
- **Header**: `Authorization: Bearer eyJhbGci...`
- **Use when**: User-specific actions, short-lived access
- **Advantages**: User identity included, better security for interactive use
- **Format**: JWT token from Auth0

## Troubleshooting

### 401 Unauthorized
- **API Key**: Check that `API_KEY` is set and valid (starts with `bz_`)
- **Bearer Token**: Token may have expired, get a new one from browser localStorage
- Ensure only ONE auth method is configured (not both)

### 404 Not Found
- Verify `APP_ID` is correct
- Ensure the app exists in your account

### 409 Conflict
- Table with this name already exists
- Try a different table name

### 400 Bad Request
- Check your column types are valid
- Ensure required fields (`name`, `type`) are provided
- For relations, referenced table must exist first

## Populating Tables with Data

See `populate-products.py` for inserting sample records into the products table.

### Running the Population Script

```bash
python populate-products.py
```

The script is interactive with 4 options:

1. **Insert sample products** - 20 predefined tech products
2. **Generate random products** - Create N random products for testing
3. **Clear and insert** - Delete existing products and insert fresh sample data
4. **View current products** - Display all products in the table

### Sample Products Included

The script includes 20 realistic tech products:
- Laptops, monitors, keyboards, mice
- Webcams, headsets, speakers
- Docking stations, hubs, chargers
- Tablets, SSDs, routers, printers

Each product has:
- Unique SKU (e.g., `LAPTOP-001`)
- Name and description
- Price (USD)
- Stock status (in stock / out of stock)
- Quantity

### Generate Random Products

```python
python populate-products.py
# Choose option 2
# Enter count: 50
```

This generates N products with random:
- Categories (Electronics, Accessories, Office, etc.)
- Names (combination of adjectives + product types)
- Prices ($29.99 - $1999.99)
- Stock quantities (0-200)

## Patching Tables

See `patch-dynas-table.py` for altering existing table schemas.

### Running the Patch Script

```bash
python patch-dynas-table.py
```

The script is interactive and lets you choose which type of modification to perform:

1. **Update metadata** - Change displayName and description
2. **Add columns** - Add new columns to the table
3. **Update columns** - Rename, change type, or modify constraints
4. **Delete columns** - Remove columns (and their data)
5. **Reorder columns** - Change the display order of columns
6. **Combined patch** - Multiple operations in one request

### Table Alteration Examples

#### Add a New Column

```python
patch = {
    "addColumns": [
        {
            "name": "category",
            "displayName": "Category",
            "type": "text"
        }
    ]
}
```

#### Rename a Column

```python
patch = {
    "updateColumns": [
        {
            "name": "name",
            "newName": "product_name"
        }
    ]
}
```

#### Change Column Type

```python
patch = {
    "updateColumns": [
        {
            "name": "price",
            "type": "float"  # Cast existing data
        }
    ]
}
```

#### Add Unique Constraint

```python
patch = {
    "updateColumns": [
        {
            "name": "sku",
            "unique": True
        }
    ]
}
```

#### Delete a Column

```python
patch = {
    "deleteColumns": ["old_field"]
}
```

⚠️ **Warning**: `deleteColumns` permanently removes the column and all its data.

#### Reorder Columns

```python
patch = {
    "columnOrder": ["id", "sku", "name", "price", "quantity"]
}
```

Note: `columnOrder` only affects API response order, not physical database order.

### Important Notes

- **Execution order**: addColumns → updateColumns (type/unique) → updateColumns (rename) → deleteColumns → columnOrder
- **All changes run in a transaction** - if any step fails, everything rolls back
- **The `id` column cannot be deleted or renamed**
- **Type changes** use `ALTER COLUMN ... TYPE ... USING col::new_type`
- **Adding UNIQUE constraints** fails with 409 if duplicate values exist

## Related Files

- `openapi.json` - Full API specification
- `create-dynas-table.py` - Create new tables
- `patch-dynas-table.py` - Alter existing tables
- `populate-products.py` - Insert sample data into products table
- `example-table-operations.py` - Full CRUD operations
- `../dynas-schema/products.json` - Products table schema
- `../docs/07-integrating-existing-projects.md` - Integration guide
- `../src/auth.ts` - How the app authenticates with dynas-client
