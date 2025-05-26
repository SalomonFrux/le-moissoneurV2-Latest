const { supabase } = require('../db/supabase');
const logger = require('../utils/logger');
const alertingService = require('./alertingService');
const natural = require('natural');
const classifier = new natural.BayesClassifier();

class AutoLabelingService {
  constructor() {
    this.confidenceThreshold = 0.8;
    this.minTrainingExamples = 10;
    this.fieldTypes = new Set([
      'title', 'description', 'price', 'date', 'email',
      'phone', 'address', 'url', 'name', 'category',
      'socialMedia', 'rating', 'review', 'quantity'
    ]);

    // Initialize classifier with common patterns
    this.initializeClassifier();
  }

  /**
   * Initialize the classifier with common patterns
   */
  async initializeClassifier() {
    try {
      // Load existing training data from database
      const { data: trainingData } = await supabase
        .from('field_training_data')
        .select('*');

      if (trainingData && trainingData.length > 0) {
        trainingData.forEach(({ text, fieldType }) => {
          classifier.addDocument(this.preprocessText(text), fieldType);
        });
        classifier.train();
      }
    } catch (error) {
      logger.error('Error initializing classifier:', error);
    }
  }

  /**
   * Preprocess text for classification
   * @param {string} text - Text to preprocess
   * @returns {string} - Preprocessed text
   */
  preprocessText(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Add training example
   * @param {string} text - Example text
   * @param {string} fieldType - Field type
   */
  async addTrainingExample(text, fieldType) {
    try {
      if (!this.fieldTypes.has(fieldType)) {
        throw new Error(`Invalid field type: ${fieldType}`);
      }

      await supabase
        .from('field_training_data')
        .insert([{
          text,
          field_type: fieldType,
          created_at: new Date().toISOString()
        }]);

      classifier.addDocument(this.preprocessText(text), fieldType);
      classifier.train();

      logger.info(`Added training example for field type: ${fieldType}`);
    } catch (error) {
      logger.error('Error adding training example:', error);
    }
  }

  /**
   * Detect field type using ML and pattern matching
   * @param {Object} params - Detection parameters
   * @returns {Object} - Detection result
   */
  async detectFieldType({ value, context = {}, headerText = '' }) {
    try {
      const results = {
        detectedType: null,
        confidence: 0,
        metadata: {}
      };

      // Combine value with context for better detection
      const textToAnalyze = [
        this.preprocessText(value),
        this.preprocessText(headerText),
        context.nearbyText || ''
      ].join(' ');

      // Get classification results
      const classifications = classifier.getClassifications(textToAnalyze);
      const topMatch = classifications[0];

      if (topMatch && topMatch.value > this.confidenceThreshold) {
        results.detectedType = topMatch.label;
        results.confidence = topMatch.value;
      }

      // Pattern-based validation
      const patternValidation = this.validateWithPatterns(value);
      if (patternValidation.matched) {
        // If pattern matching is more confident, use it
        if (!results.detectedType || patternValidation.confidence > results.confidence) {
          results.detectedType = patternValidation.fieldType;
          results.confidence = patternValidation.confidence;
        }
      }

      // Context-based enhancements
      this.enhanceWithContext(results, context);

      // Log detection for analysis
      await this.logDetection({
        value,
        headerText,
        detectedType: results.detectedType,
        confidence: results.confidence
      });

      return results;
    } catch (error) {
      logger.error('Error detecting field type:', error);
      return {
        detectedType: 'unknown',
        confidence: 0,
        error: error.message
      };
    }
  }

  /**
   * Validate value against known patterns
   * @param {string} value - Value to validate
   * @returns {Object} - Validation result
   */
  validateWithPatterns(value) {
    const patterns = {
      email: {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        confidence: 0.95
      },
      phone: {
        pattern: /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/,
        confidence: 0.9
      },
      price: {
        pattern: /^\$?\d+(?:\.\d{2})?$/,
        confidence: 0.85
      },
      date: {
        pattern: /^\d{4}-\d{2}-\d{2}|\d{2}[-/]\d{2}[-/]\d{4}$/,
        confidence: 0.9
      },
      url: {
        pattern: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
        confidence: 0.9
      }
    };

    for (const [fieldType, config] of Object.entries(patterns)) {
      if (config.pattern.test(value)) {
        return {
          matched: true,
          fieldType,
          confidence: config.confidence
        };
      }
    }

    return { matched: false };
  }

  /**
   * Enhance detection results with context
   * @param {Object} results - Detection results
   * @param {Object} context - Context information
   */
  enhanceWithContext(results, context) {
    // Enhance with header text analysis
    if (context.headerText) {
      const headerWords = context.headerText.toLowerCase().split(/\s+/);
      const typeIndicators = {
        price: ['price', 'cost', 'fee', '$'],
        date: ['date', 'published', 'created', 'updated'],
        email: ['email', 'contact', 'mail'],
        phone: ['phone', 'tel', 'contact', 'call'],
        address: ['address', 'location', 'street']
      };

      for (const [type, indicators] of Object.entries(typeIndicators)) {
        if (indicators.some(ind => headerWords.includes(ind))) {
          results.metadata.contextualHint = type;
          if (results.confidence < 0.9) {
            results.confidence += 0.1;
          }
        }
      }
    }

    // Location-based enhancement
    if (context.elementLocation) {
      if (context.elementLocation.includes('header')) {
        results.metadata.locationHint = 'header';
      } else if (context.elementLocation.includes('footer')) {
        results.metadata.locationHint = 'footer';
      }
    }
  }

  /**
   * Log field detection for analysis
   * @param {Object} params - Detection parameters
   */
  async logDetection({ value, headerText, detectedType, confidence }) {
    try {
      await supabase
        .from('field_detection_logs')
        .insert([{
          value,
          header_text: headerText,
          detected_type: detectedType,
          confidence,
          timestamp: new Date().toISOString()
        }]);

      // Alert on low confidence detections
      if (confidence < 0.6) {
        await alertingService.createAlert({
          severity: 'info',
          category: 'data_quality',
          message: 'Low confidence field detection',
          data: {
            value: value.substring(0, 50),
            detectedType,
            confidence
          }
        });
      }
    } catch (error) {
      logger.error('Error logging field detection:', error);
    }
  }

  /**
   * Get field type statistics
   * @returns {Promise<Object>} - Field type statistics
   */
  async getFieldTypeStats() {
    try {
      const { data: stats } = await supabase
        .from('field_detection_logs')
        .select('detected_type, confidence')
        .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      const results = {};
      stats.forEach(({ detected_type, confidence }) => {
        if (!results[detected_type]) {
          results[detected_type] = {
            count: 0,
            avgConfidence: 0
          };
        }
        results[detected_type].count++;
        results[detected_type].avgConfidence += confidence;
      });

      // Calculate averages
      Object.values(results).forEach(stat => {
        stat.avgConfidence = stat.avgConfidence / stat.count;
      });

      return results;
    } catch (error) {
      logger.error('Error getting field type stats:', error);
      return {};
    }
  }
}

module.exports = new AutoLabelingService();
