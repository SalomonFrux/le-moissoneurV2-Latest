# Le Moissoneur V2 Technical Documentation

## System Architecture

### Core Components
- **Playwright Scraper**: Primary scraping engine with enhanced reliability
- **Alert System**: Real-time monitoring and notification system
- **Security Service**: Comprehensive security and protection layer
- **Field Analysis**: Intelligent field type detection and validation
- **Data Quality Monitoring**: Continuous data quality assessment

### Services

#### 1. Scraping Service
- **Enhanced Selector System**
  - Multiple selector types support
  - Automatic fallback mechanisms
  - DOM structure verification
  - Selector stability scoring

#### 2. Security Service
- **Rate Limiting**
  - Per-IP request tracking
  - Configurable time windows
  - Automatic blacklisting
- **Input Validation**
  - Request signature verification
  - Configuration sanitization
  - XSS protection
- **Activity Monitoring**
  - Suspicious behavior detection
  - Real-time metrics tracking
  - Automated response actions

#### 3. Alert Service
- **Alert Categories**
  - Scraper errors
  - Performance issues
  - Data quality problems
  - Security incidents
- **Severity Levels**
  - Info
  - Warning
  - Error
  - Critical
- **Notification Channels**
  - WebSocket real-time updates
  - Database persistence
  - Custom channel support

#### 4. Field Analysis Service
- **Auto-detection Capabilities**
  - Email addresses
  - Phone numbers
  - Dates
  - URLs
  - Prices
  - Addresses
  - Social media links
- **Data Quality Metrics**
  - Missing data monitoring
  - Format validation
  - Type consistency checks

### Database Schema

#### Alerts Table
```sql
CREATE TABLE alerts (
    id UUID PRIMARY KEY,
    scraper_id UUID,
    severity VARCHAR(20),
    category VARCHAR(50),
    message TEXT,
    data JSONB,
    created_at TIMESTAMPTZ,
    status VARCHAR(20)
);
```

#### Security Events Table
```sql
CREATE TABLE security_events (
    id UUID PRIMARY KEY,
    event_type VARCHAR(50),
    details JSONB,
    timestamp TIMESTAMPTZ
);
```

### API Documentation

#### Scraper Endpoints
- `POST /api/scrapers/start`
  - Start a new scraping job
  - Requires authenticated user
  - Rate limited to 10 requests per minute

- `GET /api/scrapers/{id}/status`
  - Get real-time scraper status
  - WebSocket connection available
  - Includes performance metrics

#### Alert Endpoints
- `GET /api/alerts`
  - List alerts with filtering
  - Pagination support
  - Severity-based sorting

#### Security Endpoints
- `POST /api/security/verify`
  - Verify request signatures
  - Check rate limits
  - Validate configurations

### WebSocket Events

#### Status Updates
```javascript
{
    type: 'status_update',
    data: {
        scraperId: string,
        status: 'running' | 'completed' | 'error',
        progress: number,
        metrics: {
            itemsCollected: number,
            errorCount: number,
            duration: number
        }
    }
}
```

#### Alerts
```javascript
{
    type: 'alert',
    data: {
        severity: 'info' | 'warning' | 'error' | 'critical',
        message: string,
        category: string,
        timestamp: string
    }
}
```

### Security Considerations

1. **Rate Limiting**
   - IP-based rate limiting
   - Configurable thresholds
   - Automatic blocking of suspicious IPs

2. **Input Validation**
   - All user inputs are sanitized
   - Configuration validation
   - URL validation and sanitization

3. **Activity Monitoring**
   - Request frequency monitoring
   - Error rate tracking
   - Resource usage monitoring

4. **Data Protection**
   - Sensitive data masking
   - Secure storage practices
   - Access control implementation

### Error Handling

1. **Error Categories**
   - Navigation errors
   - Selector errors
   - Blocking detection
   - Memory issues

2. **Recovery Mechanisms**
   - Automatic retries with backoff
   - Proxy rotation on blocks
   - Fallback selector usage
   - Browser instance recovery

### Best Practices

1. **Configuration**
   ```javascript
   {
     main: {
       selectors: [
         { value: 'primary-selector', priority: 1 },
         { value: 'fallback-selector', priority: 2 }
       ]
     },
     fields: {
       title: {
         selectors: ['h1.title', '.article-title'],
         type: 'text'
       },
       price: {
         selectors: ['.price', '[data-price]'],
         type: 'price'
       }
     },
     pagination: {
       type: 'nextButton',
       selectors: ['.next-page', '[data-next]']
     }
   }
   ```

2. **Error Handling**
   ```javascript
   try {
     // Scraping logic
   } catch (error) {
     const errorType = categorizeError(error);
     await handleError(error, errorType);
   }
   ```

### Performance Optimization

1. **Browser Management**
   - Resource cleanup
   - Memory monitoring
   - Connection pooling

2. **Request Optimization**
   - Concurrent request limits
   - Request queuing
   - Cache implementation

### Deployment Guide

1. **Environment Setup**
   ```bash
   # Required environment variables
   NODE_ENV=production
   SUPABASE_URL=your-supabase-url
   SUPABASE_KEY=your-supabase-key
   MAX_CONCURRENT_SCRAPERS=5
   BROWSER_LAUNCH_TIMEOUT=180000
   NAVIGATION_TIMEOUT=60000
   ```

2. **Installation**
   ```bash
   npm install
   npm run build
   ```

3. **Running the Application**
   ```bash
   npm run start:prod
   ```

### Monitoring and Maintenance

1. **Metrics to Monitor**
   - Success rate
   - Error frequency
   - Response times
   - Resource usage

2. **Regular Maintenance**
   - Log rotation
   - Database cleanup
   - Performance optimization
   - Security updates

### Troubleshooting Guide

1. **Common Issues**
   - Rate limiting hits
   - Memory leaks
   - Selector failures
   - Network timeouts

2. **Solutions**
   - Proxy rotation
   - Browser restart
   - Selector updates
   - Configuration adjustments
