const logger = require('../utils/logger');

class DataTransformationService {
  /**
   * Apply transformations to scraped data
   * @param {Object} data - The scraped data object
   * @param {Array} transformations - Array of transformation rules
   * @returns {Object} Transformed data
   */
  applyTransformations(data, transformations) {
    if (!transformations || !Array.isArray(transformations)) {
      return data;
    }

    const transformed = { ...data };
    
    for (const field in transformed.metadata) {
      const fieldTransformations = transformations.filter(t => t.field === field);
      if (fieldTransformations.length > 0) {
        transformed.metadata[field] = this.transformValue(
          transformed.metadata[field],
          fieldTransformations
        );
      }
    }

    return transformed;
  }

  /**
   * Transform a single value using specified rules
   * @param {string} value - The value to transform
   * @param {Array} transformations - Array of transformation rules
   * @returns {string} Transformed value
   */
  transformValue(value, transformations) {
    if (!value) return value;

    let result = value;

    for (const transformation of transformations) {
      try {
        switch (transformation.type) {
          case 'trimWhitespace':
            result = this.trimWhitespace(result);
            break;

          case 'regexReplace':
            result = this.regexReplace(
              result,
              transformation.pattern,
              transformation.replacement
            );
            break;

          case 'removeText':
            result = this.removeText(result, transformation.textToRemove);
            break;

          case 'prependText':
            result = this.prependText(result, transformation.textToPrepend);
            break;

          case 'appendText':
            result = this.appendText(result, transformation.textToAppend);
            break;

          case 'capitalize':
            result = this.capitalize(result);
            break;

          case 'lowercase':
            result = result.toLowerCase();
            break;

          case 'uppercase':
            result = result.toUpperCase();
            break;

          case 'extractNumber':
            result = this.extractNumber(result);
            break;

          case 'formatDate':
            result = this.formatDate(result, transformation.format);
            break;

          case 'custom':
            result = this.executeCustomTransformation(
              result,
              transformation.function
            );
            break;

          default:
            logger.warn(`Unknown transformation type: ${transformation.type}`);
        }
      } catch (error) {
        logger.error(`Error applying transformation ${transformation.type}:`, error);
      }
    }

    return result;
  }

  /**
   * Remove excess whitespace
   */
  trimWhitespace(value) {
    return value.replace(/\s+/g, ' ').trim();
  }

  /**
   * Replace text using regex
   */
  regexReplace(value, pattern, replacement) {
    try {
      const regex = new RegExp(pattern, 'g');
      return value.replace(regex, replacement);
    } catch (error) {
      logger.error(`Invalid regex pattern: ${pattern}`, error);
      return value;
    }
  }

  /**
   * Remove specific text
   */
  removeText(value, textToRemove) {
    return value.replace(new RegExp(textToRemove, 'g'), '');
  }

  /**
   * Prepend text
   */
  prependText(value, textToPrepend) {
    return `${textToPrepend}${value}`;
  }

  /**
   * Append text
   */
  appendText(value, textToAppend) {
    return `${value}${textToAppend}`;
  }

  /**
   * Capitalize text
   */
  capitalize(value) {
    return value
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Extract numbers from text
   */
  extractNumber(value) {
    const matches = value.match(/[\d,.]+/);
    return matches ? matches[0] : value;
  }

  /**
   * Format date string
   */
  formatDate(value, format) {
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date');
      }

      // Basic date formatting - expand as needed
      switch (format) {
        case 'ISO':
          return date.toISOString();
        case 'short':
          return date.toLocaleDateString();
        case 'long':
          return date.toLocaleString();
        default:
          return value;
      }
    } catch (error) {
      logger.error(`Error formatting date: ${value}`, error);
      return value;
    }
  }

  /**
   * Execute custom transformation function
   * WARNING: This should be used with caution and proper validation
   */
  executeCustomTransformation(value, functionString) {
    try {
      // Basic security check
      if (functionString.includes('require') || functionString.includes('process')) {
        throw new Error('Unsafe custom transformation detected');
      }

      const transformFn = new Function('value', `return ${functionString}`);
      return transformFn(value);
    } catch (error) {
      logger.error(`Error executing custom transformation:`, error);
      return value;
    }
  }
}

module.exports = new DataTransformationService();
