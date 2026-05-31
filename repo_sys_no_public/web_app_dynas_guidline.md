# Dynas Schema Design Guidelines for Data-Centric Web Applications

**Target Applications**: Content discovery and recommendation platforms with rich multimedia (Pinterest, YouTube, Coursera, Red Note, Amazon, Instagram, Netflix)

**Version**: 1.0  
**Last Updated**: 2026-04-10

---

## Table of Contents

1. [Introduction](#introduction)
2. [Core Principles](#core-principles)
3. [Architecture Pattern](#architecture-pattern)
4. [Schema Design Patterns](#schema-design-patterns)
5. [Platform-Specific Examples](#platform-specific-examples)
6. [Search & Recommendation Support](#search--recommendation-support)
7. [Multimedia Content Handling](#multimedia-content-handling)
8. [Best Practices](#best-practices)
9. [Common Pitfalls](#common-pitfalls)
10. [API Integration Patterns](#api-integration-patterns)

---

## 1. Introduction

This guide provides AI agents with a structured approach to designing dynas database schemas for **data-centric web applications** — platforms where users primarily **discover, browse, and interact with content** rather than create or manage complex data structures.

### Characteristics of Target Applications

✅ **Content Discovery**: Users browse through collections of items (pins, videos, courses, products)  
✅ **Visual-First**: Heavy use of images, videos, thumbnails, and rich media  
✅ **Recommendation-Driven**: Content suggestions based on categories, tags, user behavior  
✅ **Read-Heavy**: 90%+ read operations, occasional user interactions (save, like, comment)  
✅ **Categorized/Taxonomized**: Content organized by categories, topics, genres, or tags  

### Out of Scope

❌ Complex transactional systems (banking, inventory management)  
❌ Collaborative editing platforms (Google Docs, Figma)  
❌ Real-time messaging or chat applications  
❌ Multi-tenant SaaS with complex permissions  

---

## 2. Core Principles

### Principle 1: Single Resources Table (Read-Only)

**Pattern**: One primary table containing the **content items** that users browse.

```json
{
  "name": "resources",
  "displayName": "Content Resources",
  "description": "Primary content items for discovery and browsing",
  "columns": [
    {"name": "title", "type": "text"},
    {"name": "description", "type": "text"},
    {"name": "image_url", "type": "text"},
    {"name": "category_slug", "type": "text"},
    {"name": "tags", "type": "json"},
    {"name": "metadata", "type": "json"}
  ]
}
```

**Why?**
- Simple, predictable data model
- Optimized for browse/search operations
- Easy to filter, sort, and aggregate
- Clear separation between content and metadata

### Principle 2: Taxonomy Tables for Organization

**Pattern**: Separate tables for categories, tags, and classification metadata.

```json
{
  "name": "categories",
  "displayName": "Content Categories",
  "columns": [
    {"name": "slug", "type": "text", "unique": true},
    {"name": "label", "type": "text"},
    {"name": "description", "type": "text"},
    {"name": "thumbnail_url", "type": "text"},
    {"name": "sort_order", "type": "integer"}
  ]
}
```

### Principle 3: Denormalization for Performance

**Pattern**: Store frequently accessed data directly in the resources table, even if it duplicates taxonomy data.

**Good**: ✅ Store category name AND category_id  
**Bad**: ❌ Only store category_id, requiring joins on every query  

### Principle 4: JSON for Flexible Metadata

**Pattern**: Use JSON columns for:
- Tags arrays: `["landscape", "nature", "mountains"]`
- Rich metadata: `{"duration": 180, "resolution": "4K", "likes": 1234}`
- Nested properties: `{"author": {"name": "...", "avatar": "..."}}`

---

## 3. Architecture Pattern

### Standard 3-Table Setup

```
┌─────────────┐
│ categories  │  ← Taxonomy (reference data)
│ - id        │
│ - slug      │
│ - label     │
└─────────────┘
       ↑
       │ FK
       │
┌─────────────┐
│ resources   │  ← Primary content (read-mostly)
│ - id        │
│ - title     │
│ - image_url │
│ - category  │  ← Denormalized for perf
│ - tags      │  ← JSON array
│ - metadata  │  ← JSON object
└─────────────┘
       ↑
       │ FK (optional)
       │
┌─────────────┐
│ user_saves  │  ← User interactions (write-heavy)
│ - user_id   │
│ - resource  │
│ - saved_at  │
└─────────────┘
```

### Table Responsibilities

| Table | Purpose | Read/Write Ratio | RLS Required |
|-------|---------|------------------|--------------|
| **categories** | Classification taxonomy | 99% read | No |
| **resources** | Primary browseable content | 95% read | No (public) |
| **user_saves** | User-specific interactions | 50/50 | Yes (user isolation) |

---

## 4. Schema Design Patterns

### Pattern 1: Pinterest-Style Gallery

**Use Case**: Image/pin discovery platform

```json
{
  "tables": [
    {
      "name": "categories",
      "displayName": "Pin Categories",
      "columns": [
        {"name": "slug", "type": "text", "unique": true},
        {"name": "label", "type": "text"},
        {"name": "thumbnail_url", "type": "text"}
      ]
    },
    {
      "name": "pins",
      "displayName": "Pins",
      "description": "Images and visual content for discovery",
      "columns": [
        {"name": "title", "type": "text"},
        {"name": "description", "type": "text"},
        {"name": "image_url", "type": "text"},
        {"name": "source_url", "type": "text"},
        {"name": "category_slug", "type": "text"},
        {"name": "category_label", "type": "text"},
        {"name": "tags", "type": "json"},
        {"name": "author", "type": "json"},
        {"name": "stats", "type": "json"}
      ],
      "relations": [{
        "type": "many-to-one",
        "foreignKeyColumn": "category_slug",
        "referencesTable": "categories",
        "referencesColumn": "slug"
      }]
    },
    {
      "name": "user_boards",
      "displayName": "User Boards",
      "description": "User-created collections of pins",
      "columns": [
        {"name": "user_id", "type": "text"},
        {"name": "name", "type": "text"},
        {"name": "description", "type": "text"},
        {"name": "pin_ids", "type": "json"}
      ]
    }
  ]
}
```

**Key Features**:
- Denormalized `category_label` for display without joins
- JSON `tags` for flexible tagging (`["nature", "landscape"]`)
- JSON `author` for creator metadata (`{"name": "...", "avatar_url": "..."}`)
- JSON `stats` for engagement (`{"saves": 123, "views": 4567}`)

### Pattern 2: YouTube-Style Video Platform

**Use Case**: Video content library with channels

```json
{
  "tables": [
    {
      "name": "channels",
      "displayName": "Content Channels",
      "columns": [
        {"name": "channel_id", "type": "text", "unique": true},
        {"name": "name", "type": "text"},
        {"name": "description", "type": "text"},
        {"name": "avatar_url", "type": "text"},
        {"name": "subscriber_count", "type": "integer"}
      ]
    },
    {
      "name": "videos",
      "displayName": "Videos",
      "columns": [
        {"name": "title", "type": "text"},
        {"name": "description", "type": "text"},
        {"name": "thumbnail_url", "type": "text"},
        {"name": "video_url", "type": "text"},
        {"name": "duration_seconds", "type": "integer"},
        {"name": "channel_id", "type": "text"},
        {"name": "channel_name", "type": "text"},
        {"name": "published_at", "type": "datetime"},
        {"name": "tags", "type": "json"},
        {"name": "stats", "type": "json"}
      ],
      "relations": [{
        "type": "many-to-one",
        "foreignKeyColumn": "channel_id",
        "referencesTable": "channels",
        "referencesColumn": "channel_id"
      }]
    },
    {
      "name": "playlists",
      "displayName": "User Playlists",
      "columns": [
        {"name": "user_id", "type": "text"},
        {"name": "name", "type": "text"},
        {"name": "video_ids", "type": "json"}
      ]
    }
  ]
}
```

**Metadata Examples**:
```json
// videos.tags
["tutorial", "javascript", "web-development"]

// videos.stats
{
  "views": 125000,
  "likes": 4500,
  "comments": 320,
  "resolution": "1080p"
}
```

### Pattern 3: E-Learning Platform (Coursera-Style)

**Use Case**: Course catalog with modules and lessons

```json
{
  "tables": [
    {
      "name": "topics",
      "columns": [
        {"name": "slug", "type": "text", "unique": true},
        {"name": "label", "type": "text"},
        {"name": "icon_url", "type": "text"}
      ]
    },
    {
      "name": "courses",
      "displayName": "Courses",
      "columns": [
        {"name": "title", "type": "text"},
        {"name": "description", "type": "text"},
        {"name": "thumbnail_url", "type": "text"},
        {"name": "instructor_name", "type": "text"},
        {"name": "instructor_avatar", "type": "text"},
        {"name": "topic_slug", "type": "text"},
        {"name": "topic_label", "type": "text"},
        {"name": "difficulty", "type": "text"},
        {"name": "duration_hours", "type": "integer"},
        {"name": "skills", "type": "json"},
        {"name": "syllabus", "type": "json"},
        {"name": "stats", "type": "json"}
      ]
    },
    {
      "name": "user_enrollments",
      "columns": [
        {"name": "user_id", "type": "text"},
        {"name": "course_id", "type": "integer"},
        {"name": "progress_percent", "type": "integer"},
        {"name": "completed_lessons", "type": "json"}
      ]
    }
  ]
}
```

**Syllabus JSON Structure**:
```json
{
  "modules": [
    {
      "title": "Introduction to React",
      "lessons": [
        {"title": "What is React?", "duration": 15},
        {"title": "Components Basics", "duration": 25}
      ]
    }
  ]
}
```

### Pattern 4: E-Commerce Product Catalog (Amazon-Style)

**Use Case**: Product discovery and browsing

```json
{
  "tables": [
    {
      "name": "categories",
      "columns": [
        {"name": "slug", "type": "text", "unique": true},
        {"name": "label", "type": "text"},
        {"name": "parent_slug", "type": "text"},
        {"name": "icon_url", "type": "text"}
      ]
    },
    {
      "name": "products",
      "displayName": "Products",
      "columns": [
        {"name": "sku", "type": "text", "unique": true},
        {"name": "name", "type": "text"},
        {"name": "description", "type": "text"},
        {"name": "price", "type": "float"},
        {"name": "image_url", "type": "text"},
        {"name": "category_slug", "type": "text"},
        {"name": "category_path", "type": "json"},
        {"name": "brand", "type": "text"},
        {"name": "attributes", "type": "json"},
        {"name": "images", "type": "json"},
        {"name": "reviews", "type": "json"}
      ]
    },
    {
      "name": "user_wishlist",
      "columns": [
        {"name": "user_id", "type": "text"},
        {"name": "product_id", "type": "integer"},
        {"name": "added_at", "type": "datetime"}
      ]
    }
  ]
}
```

**Product Attributes JSON**:
```json
{
  "color": "Black",
  "size": "Large",
  "material": "Cotton",
  "weight_kg": 0.5,
  "dimensions": {"width": 30, "height": 40, "depth": 2}
}
```

---

## 5. Platform-Specific Examples

### Pinterest Mock Schema

```json
{
  "name": "Pinterest Clone",
  "tables": [
    {
      "name": "categories",
      "columns": [
        {"name": "slug", "type": "text", "unique": true},
        {"name": "label", "type": "text"},
        {"name": "description", "type": "text"}
      ]
    },
    {
      "name": "pins",
      "columns": [
        {"name": "title", "type": "text"},
        {"name": "description", "type": "text"},
        {"name": "image_url", "type": "text"},
        {"name": "source_url", "type": "text"},
        {"name": "category_slug", "type": "text"},
        {"name": "tags", "type": "json"},
        {"name": "created_at", "type": "datetime"}
      ],
      "relations": [{
        "type": "many-to-one",
        "foreignKeyColumn": "category_slug",
        "referencesTable": "categories",
        "referencesColumn": "slug"
      }]
    }
  ]
}
```

### Red Note (小红书) Mock Schema

```json
{
  "name": "Red Note Clone",
  "tables": [
    {
      "name": "topics",
      "columns": [
        {"name": "slug", "type": "text", "unique": true},
        {"name": "label", "type": "text"},
        {"name": "emoji", "type": "text"}
      ]
    },
    {
      "name": "posts",
      "columns": [
        {"name": "title", "type": "text"},
        {"name": "content", "type": "text"},
        {"name": "cover_image", "type": "text"},
        {"name": "images", "type": "json"},
        {"name": "topic_slug", "type": "text"},
        {"name": "tags", "type": "json"},
        {"name": "author", "type": "json"},
        {"name": "engagement", "type": "json"}
      ]
    }
  ]
}
```

**Post Images JSON**:
```json
[
  {"url": "https://...", "caption": "Before"},
  {"url": "https://...", "caption": "After"}
]
```

---

## 6. Search & Recommendation Support

### Full-Text Search Setup

**Pattern**: Add searchable text column combining multiple fields

```json
{
  "name": "videos",
  "columns": [
    {"name": "title", "type": "text"},
    {"name": "description", "type": "text"},
    {"name": "tags", "type": "json"},
    {"name": "search_text", "type": "text"}
  ]
}
```

**Populate search_text** (in app logic or via trigger):
```sql
-- Concatenate searchable fields
UPDATE videos SET search_text = 
  title || ' ' || description || ' ' || array_to_string(tags, ' ')
```

**Query with LIKE**:
```json
{
  "filter": {
    "field": "search_text",
    "op": "like",
    "value": "%react%"
  }
}
```

### Recommendation via Tags

**Pattern**: Store tags as JSON array for flexible filtering

```json
{
  "name": "courses",
  "columns": [
    {"name": "skills", "type": "json"}
  ]
}
```

**Sample Data**:
```json
// Course 1
{"skills": ["javascript", "react", "frontend"]}

// Course 2
{"skills": ["javascript", "node", "backend"]}
```

**Find Related** (SQL query with JSON operators):
```sql
SELECT * FROM courses 
WHERE skills::jsonb ?| array['javascript', 'react']
ORDER BY id DESC LIMIT 10
```

### Category-Based Browse

**Pattern**: Denormalize category for fast filtering

```json
{
  "name": "products",
  "columns": [
    {"name": "category_slug", "type": "text"},
    {"name": "category_label", "type": "text"}
  ]
}
```

**Filter Products by Category**:
```json
{
  "filter": {
    "field": "category_slug",
    "op": "eq",
    "value": "electronics"
  },
  "sort": "created_at:desc",
  "limit": 20
}
```

---

## 7. Multimedia Content Handling

### Image URLs

**Pattern**: Store URLs as text, optionally with multiple sizes in JSON

**Simple**:
```json
{"name": "image_url", "type": "text"}
```

**Multi-Resolution**:
```json
{
  "name": "images",
  "type": "json"
  // Value: {"thumb": "...", "medium": "...", "large": "..."}
}
```

### Video Metadata

**Pattern**: Store video URL + metadata in separate columns

```json
{
  "name": "videos",
  "columns": [
    {"name": "video_url", "type": "text"},
    {"name": "thumbnail_url", "type": "text"},
    {"name": "duration_seconds", "type": "integer"},
    {"name": "video_metadata", "type": "json"}
  ]
}
```

**video_metadata JSON**:
```json
{
  "format": "mp4",
  "resolution": "1080p",
  "codec": "h264",
  "size_mb": 45.2,
  "captions": ["en", "zh"]
}
```

### Rich Text Content

**Pattern**: Store HTML or Markdown as text, optionally with preview

```json
{
  "name": "posts",
  "columns": [
    {"name": "content_html", "type": "text"},
    {"name": "preview_text", "type": "text"}
  ]
}
```

### File Attachments

**Pattern**: Use dynas Files API for uploads, store references in table

```json
{
  "name": "resources",
  "columns": [
    {"name": "attachment_id", "type": "text"},
    {"name": "attachment_metadata", "type": "json"}
  ]
}
```

**Upload Flow**:
1. POST `/v1/apps/{appId}/files` → get `resourceId`
2. Store `resourceId` in table
3. Fetch content via GET `/v1/apps/{appId}/files/{resourceId}/content`

---

## 8. Best Practices

### ✅ DO

1. **Denormalize for Read Performance**
   - Store category name alongside category_id
   - Duplicate frequently accessed fields
   - Accept some data redundancy for speed

2. **Use JSON for Flexibility**
   - Arrays: `["tag1", "tag2"]`
   - Nested objects: `{"author": {"name": "...", "avatar": "..."}}`
   - Stats/metrics: `{"views": 123, "likes": 45}`

3. **Meaningful Column Names**
   - ✅ `thumbnail_url`, `cover_image`, `video_url`
   - ❌ `url`, `image`, `file`

4. **Unique Constraints on Slugs**
   - Categories, topics, tags should have unique slugs
   - Enables clean URLs: `/category/landscapes`

5. **Separate User Data**
   - Keep user interactions (saves, likes) in separate tables
   - Apply RLS policies to user-specific tables only

6. **Use datetime for Timestamps**
   - `created_at`, `published_at`, `updated_at`
   - Enables sorting by recency

7. **Store Engagement Metrics**
   - Use JSON for flexible stats: `{"views": 0, "saves": 0, "shares": 0}`
   - Update via PATCH operations

### ❌ DON'T

1. **Don't Over-Normalize**
   - ❌ Separate tables for tags, authors, stats
   - ✅ JSON columns for flexible nested data

2. **Don't Use Integer IDs for Categories**
   - ❌ `category_id: 1, 2, 3`
   - ✅ `category_slug: "landscapes", "portraits"`
   - Why: Slugs are human-readable and URL-friendly

3. **Don't Store Binary Data**
   - ❌ BLOB columns for images/videos
   - ✅ URLs pointing to CDN/storage service

4. **Don't Create Premature Relations**
   - ❌ Foreign keys for every possible relationship
   - ✅ Start simple, add relations only when needed

5. **Don't Mix User and Content Data**
   - ❌ `user_id` column in resources table
   - ✅ Separate `user_saves` join table

6. **Don't Forget Descriptions**
   - Every table and column should have a clear description
   - Helps AI understand the schema purpose

---

## 9. Common Pitfalls

### Pitfall 1: Over-Relational Design

**Problem**: Creating too many tables with complex joins

❌ **Bad** (5 tables with joins):
```
categories → subcategories → pins → pin_tags → tags
```

✅ **Good** (2 tables, JSON tags):
```json
{
  "name": "categories",
  "columns": [{"name": "slug", "type": "text", "unique": true}]
}

{
  "name": "pins",
  "columns": [
    {"name": "category_slug", "type": "text"},
    {"name": "tags", "type": "json"}
  ]
}
```

### Pitfall 2: Missing Denormalization

**Problem**: Requiring joins for every query

❌ **Bad**:
```json
{
  "name": "videos",
  "columns": [
    {"name": "channel_id", "type": "integer"}
    // Missing channel_name!
  ]
}
```

✅ **Good**:
```json
{
  "name": "videos",
  "columns": [
    {"name": "channel_id", "type": "integer"},
    {"name": "channel_name", "type": "text"},
    {"name": "channel_avatar", "type": "text"}
  ]
}
```

### Pitfall 3: Storing Arrays as Text

**Problem**: Comma-separated strings instead of JSON

❌ **Bad**:
```json
{"name": "tags", "type": "text"}
// Value: "landscape,nature,mountains"
```

✅ **Good**:
```json
{"name": "tags", "type": "json"}
// Value: ["landscape", "nature", "mountains"]
```

### Pitfall 4: Generic Column Names

**Problem**: Ambiguous names that need context

❌ **Bad**:
```json
{"name": "url", "type": "text"}
{"name": "image", "type": "text"}
{"name": "date", "type": "datetime"}
```

✅ **Good**:
```json
{"name": "thumbnail_url", "type": "text"}
{"name": "cover_image_url", "type": "text"}
{"name": "published_at", "type": "datetime"}
```

---

## 10. API Integration Patterns

### Listing Resources with Filters

**Browse by Category**:
```http
GET /v1/apps/{appId}/tables/pins/records?filter={"field":"category_slug","op":"eq","value":"landscapes"}&sort=created_at:desc&limit=20
```

**Search by Tags** (using JSON operators via raw SQL):
```http
POST /v1/apps/{appId}/tables/query
{
  "query": "SELECT * FROM pins WHERE tags::jsonb ?| $1 ORDER BY created_at DESC LIMIT 20",
  "params": [["nature", "landscape"]],
  "readonly": true
}
```

### Joining with Categories

**Get Pins with Category Details**:
```http
GET /v1/apps/{appId}/tables/pins/records?join=categories&fields=id,title,image_url,categories.label&limit=20
```

**Response**:
```json
{
  "data": [
    {
      "id": 1,
      "title": "Mountain View",
      "image_url": "https://...",
      "categories": {
        "label": "Landscapes",
        "thumbnail_url": "https://..."
      }
    }
  ]
}
```

### User-Specific Data with RLS

**Setup Policy**:
```json
{
  "name": "user_isolation",
  "operation": "select",
  "role": "authenticated",
  "condition": {
    "field": "user_id",
    "op": "eq",
    "value": ":current_user_id"
  }
}
```

**Query** (automatically filtered by user_id):
```http
GET /v1/apps/{appId}/tables/user_saves/records
```

### Aggregations for Stats

**Count pins by category**:
```http
POST /v1/apps/{appId}/tables/pins/aggregate
{
  "aggregations": [{"function": "count"}],
  "groupBy": ["category_slug"],
  "sort": "count:desc"
}
```

**Response**:
```json
{
  "data": [
    {"category_slug": "landscapes", "count": 145},
    {"category_slug": "portraits", "count": 89}
  ]
}
```

---

## Quick Reference Checklist

When designing a schema for a data-centric web app, ensure:

- [ ] **Single primary table** for browseable content (e.g., `pins`, `videos`, `courses`)
- [ ] **Taxonomy table(s)** for categories/topics with `slug` unique constraint
- [ ] **Denormalized fields** for category names, author info, etc.
- [ ] **JSON columns** for tags, metadata, stats, nested objects
- [ ] **Meaningful column names**: `thumbnail_url`, not `url`
- [ ] **datetime columns** for timestamps (`created_at`, `published_at`)
- [ ] **Clear descriptions** on all tables and columns
- [ ] **User interaction tables** separate from content (e.g., `user_saves`)
- [ ] **RLS policies** on user-specific tables only
- [ ] **No BLOB columns** — use URLs to external storage

---

## Example Bootstrap Script

**Complete Pinterest-style app in one API call**:

```json
{
  "name": "Pinterest Clone",
  "description": "Visual discovery platform for browsing and saving pins",
  "tables": [
    {
      "name": "categories",
      "displayName": "Categories",
      "description": "Pin categories for organization and discovery",
      "columns": [
        {
          "name": "slug",
          "displayName": "Slug",
          "description": "URL-friendly category identifier",
          "type": "text",
          "unique": true
        },
        {
          "name": "label",
          "displayName": "Label",
          "description": "Display name of the category",
          "type": "text"
        },
        {
          "name": "thumbnail_url",
          "displayName": "Thumbnail URL",
          "type": "text"
        }
      ]
    },
    {
      "name": "pins",
      "displayName": "Pins",
      "description": "Visual content items for discovery and saving",
      "columns": [
        {"name": "title", "displayName": "Title", "type": "text"},
        {"name": "description", "displayName": "Description", "type": "text"},
        {"name": "image_url", "displayName": "Image URL", "type": "text"},
        {"name": "source_url", "displayName": "Source URL", "type": "text"},
        {
          "name": "category_slug",
          "displayName": "Category Slug",
          "type": "text"
        },
        {
          "name": "category_label",
          "displayName": "Category Label",
          "description": "Denormalized for display without joins",
          "type": "text"
        },
        {
          "name": "tags",
          "displayName": "Tags",
          "description": "Array of tag strings",
          "type": "json"
        },
        {
          "name": "author",
          "displayName": "Author",
          "description": "Creator metadata (name, avatar, etc.)",
          "type": "json"
        },
        {
          "name": "stats",
          "displayName": "Stats",
          "description": "Engagement metrics (saves, views, etc.)",
          "type": "json"
        },
        {
          "name": "created_at",
          "displayName": "Created At",
          "type": "datetime"
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
    },
    {
      "name": "user_boards",
      "displayName": "User Boards",
      "description": "User-created collections of saved pins",
      "columns": [
        {"name": "user_id", "displayName": "User ID", "type": "text"},
        {"name": "name", "displayName": "Board Name", "type": "text"},
        {"name": "description", "displayName": "Description", "type": "text"},
        {
          "name": "pin_ids",
          "displayName": "Pin IDs",
          "description": "Array of saved pin IDs",
          "type": "json"
        }
      ]
    }
  ]
}
```

---

## Summary

**For data-centric web applications:**

1. ✅ Start with **1 primary resources table** (read-mostly)
2. ✅ Add **taxonomy tables** (categories, topics) with unique slugs
3. ✅ **Denormalize** frequently accessed fields (category names, etc.)
4. ✅ Use **JSON columns** for tags, metadata, stats, nested data
5. ✅ Store **multimedia as URLs** (images, videos, files)
6. ✅ Keep **user interactions separate** (saves, likes, playlists)
7. ✅ Apply **RLS policies** only to user-specific tables
8. ✅ Support **search** via concatenated text columns + LIKE
9. ✅ Enable **recommendations** via JSON tag queries
10. ✅ Use **aggregations** for category counts, trending content

This pattern works for Pinterest, YouTube, Coursera, Red Note, Amazon, Instagram, Netflix, and similar platforms where users primarily **browse, discover, and interact with visual/multimedia content**.

---

**End of Guidelines** • Version 1.0 • Last Updated: 2026-04-10
