const { supabase } = require('../db/supabase');
const logger = require('../utils/logger');

class FieldAnalysisService {
  constructor() {
    this.confidenceThreshold = 0.8;
  }

  /**
   * Record field type detection results for analysis
   * @param {Object} params Field detection parameters
   * @param {string} params.jobId The scraping job ID
   * @param {string} params.fieldName Original field name
   * @param {string} params.detectedType Automatically detected type
   * @param {string} params.configuredType Type specified in configuration (if any)
   * @param {string} params.value The actual field value
   */
  async recordFieldDetection({ jobId, fieldName, detectedType, configuredType, value }) {
    try {
      const { data, error } = await supabase
        .from('field_analysis')
        .insert({
          job_id: jobId,
          field_name: fieldName,
          detected_type: detectedType,
          configured_type: configuredType,
          value: value,
          timestamp: new Date().toISOString()
        });

      if (error) {
        logger.error('Error recording field analysis:', error);
      }
    } catch (error) {
      logger.error('Failed to record field analysis:', error);
    }
  }

  /**
   * Calculate confidence scores for field type detection
   * @param {string} fieldName The field name to analyze
   * @returns {Promise<Object>} Confidence scores for each field type
   */
  async getFieldTypeConfidence(fieldName) {
    try {
      const { data, error } = await supabase
        .from('field_analysis')
        .select('detected_type, configured_type')
        .eq('field_name', fieldName)
        .limit(100);

      if (error) {
        logger.error('Error getting field analysis:', error);
        return {};
      }

      const typeMatches = data.reduce((acc, record) => {
        const match = record.configured_type === record.detected_type;
        acc[record.detected_type] = acc[record.detected_type] || { total: 0, matches: 0 };
        acc[record.detected_type].total++;
        if (match) acc[record.detected_type].matches++;
        return acc;
      }, {});

      const confidence = {};
      for (const [type, counts] of Object.entries(typeMatches)) {
        confidence[type] = counts.matches / counts.total;
      }

      return confidence;
    } catch (error) {
      logger.error('Failed to calculate field type confidence:', error);
      return {};
    }
  }

  /**
   * Get field type suggestions based on historical data
   * @param {string} fieldName The field name to get suggestions for
   * @returns {Promise<string|null>} Suggested field type or null if no confident suggestion
   */
  async suggestFieldType(fieldName) {
    const confidence = await this.getFieldTypeConfidence(fieldName);
    const bestMatch = Object.entries(confidence)
      .reduce((best, [type, score]) => {
        return score > (best.score || 0) ? { type, score } : best;
      }, { type: null, score: 0 });

    return bestMatch.score >= this.confidenceThreshold ? bestMatch.type : null;
  }
}

module.exports = new FieldAnalysisService();
