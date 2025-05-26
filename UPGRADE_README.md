# Le Moissoneur V2 - Enhanced Web Scraping Platform

## Phase 1 Enhancements

### New Features
1. Enhanced Selector Definition & Testing
   - Multiple selector types support (CSS, XPath)
   - Real-time selector testing
   - Fallback selectors for resilience

2. Robust Pagination
   - Support for multiple pagination types:
     - Next button navigation
     - Numbered page links
     - Load More buttons
   - Configurable maximum pages
   - Automatic detection of pagination end

3. Job Queue System
   - Asynchronous job processing with BullMQ
   - Job status monitoring
   - Automatic retries on failure
   - Concurrent job execution

4. Improved Logging & Statistics
   - Detailed job history
   - Per-scraper statistics
   - Enhanced error reporting

### Setup Instructions

1. Install Dependencies:
```bash
npm install
```

2. Set up Redis:
- Install Redis on your system
- Start Redis server
- Configure Redis connection in .env file

3. Configure Environment:
- Copy .env.example to .env
- Update environment variables:
  - Redis configuration
  - Supabase credentials
  - JWT secret
  - Other configuration options

4. Database Setup:
```bash
# Connect to your Supabase database and run:
psql -f backend/src/db/schema.sql
```

5. Start Development Server:
```bash
# Terminal 1 - Start API server
npm run dev

# Terminal 2 - Start worker
npm run worker:dev
```

6. Start Production Server:
```bash
# Start both API and worker with PM2
npm start
```

### API Endpoints

#### Selector Testing
- POST /api/scrapers/test-selector
  Test a selector against a URL
  ```json
  {
    "url": "https://example.com",
    "selector": {
      "type": "css",
      "value": ".example-class"
    }
  }
  ```

- POST /api/scrapers/test-pagination
  Test pagination configuration
  ```json
  {
    "url": "https://example.com",
    "pagination": {
      "type": "nextButton",
      "selectors": [
        {
          "type": "css",
          "value": ".next-page"
        }
      ]
    }
  }
  ```

### Scraper Configuration Example

```json
{
  "main": {
    "selectors": [
      {
        "type": "css",
        "value": ".item-card"
      },
      {
        "type": "xpath",
        "value": "//div[contains(@class, 'item')]"
      }
    ]
  },
  "fields": {
    "title": {
      "type": "text",
      "selectors": [
        {
          "type": "css",
          "value": ".item-title"
        }
      ]
    },
    "email": {
      "type": "email",
      "selectors": [
        {
          "type": "css",
          "value": ".contact-email"
        },
        {
          "type": "xpath",
          "value": "//a[contains(@href, 'mailto:')]"
        }
      ]
    }
  },
  "pagination": {
    "type": "nextButton",
    "selectors": [
      {
        "type": "css",
        "value": ".pagination .next"
      }
    ],
    "maxPages": 20
  }
}
```

### Monitoring

- View job statuses in real-time
- Monitor scraping progress through WebSocket updates
- Check detailed logs in the `logs` directory
- View scraping statistics in the dashboard
