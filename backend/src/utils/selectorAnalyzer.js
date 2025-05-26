const logger = require('../utils/logger');

class SelectorAnalyzer {
  /**
   * Calculate stability score for a selector
   * @param {Object} selector - Selector object with type and value
   * @param {string} html - HTML content to analyze
   * @returns {Object} Stability analysis result
   */
  analyzeSelector(selector, html) {
    const score = {
      value: 0,
      factors: [],
      recommendation: null
    };

    // Parse HTML to analyze DOM structure
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Analyze selector characteristics
    this.analyzeSpecificity(selector, score);
    this.analyzeReliance(selector, score);
    this.analyzeDepth(selector, score);
    this.analyzeUniqueness(selector, doc, score);
    
    // Calculate final score (0-100)
    score.value = Math.min(100, Math.max(0, score.factors.reduce((sum, factor) => sum + factor.score, 0)));
    
    // Add recommendations based on score
    this.addRecommendations(selector, score);

    return {
      stability: this.getStabilityLevel(score.value),
      score: score.value,
      factors: score.factors,
      recommendation: score.recommendation
    };
  }

  /**
   * Analyze selector specificity
   */
  analyzeSpecificity(selector, score) {
    const value = selector.value;
    
    if (selector.type === 'css') {
      // Check for ID usage
      if (value.includes('#')) {
        score.factors.push({
          name: 'ID Usage',
          score: 30,
          description: 'Using IDs provides high specificity but may be less stable if IDs are dynamically generated'
        });
      }

      // Check for class usage
      const classCount = (value.match(/\./g) || []).length;
      score.factors.push({
        name: 'Class Usage',
        score: Math.min(25, classCount * 5),
        description: `Uses ${classCount} classes for selection`
      });

      // Check for attribute selectors
      if (value.includes('[')) {
        score.factors.push({
          name: 'Attribute Usage',
          score: 15,
          description: 'Using attributes can provide good stability'
        });
      }
    } else if (selector.type === 'xpath') {
      // Analyze XPath complexity
      const complexity = this.analyzeXPathComplexity(value);
      score.factors.push({
        name: 'XPath Complexity',
        score: Math.max(0, 30 - complexity * 5),
        description: `XPath complexity level: ${complexity}`
      });
    }
  }

  /**
   * Analyze selector's reliance on volatile elements
   */
  analyzeReliance(selector, score) {
    const value = selector.value.toLowerCase();
    const volatilePatterns = [
      'nth-child',
      'nth-of-type',
      'first-child',
      'last-child'
    ];

    const volatileCount = volatilePatterns.filter(pattern => 
      value.includes(pattern)
    ).length;

    if (volatileCount > 0) {
      score.factors.push({
        name: 'Position Dependency',
        score: -10 * volatileCount,
        description: 'Relying on element position reduces stability'
      });
    }
  }

  /**
   * Analyze selector depth in DOM
   */
  analyzeDepth(selector, score) {
    const depth = selector.value.split(/>|\s+/).length;
    
    score.factors.push({
      name: 'Selector Depth',
      score: Math.max(0, 20 - depth * 3),
      description: `Selector depth: ${depth} levels`
    });
  }

  /**
   * Analyze selector uniqueness
   */
  analyzeUniqueness(selector, doc, score) {
    try {
      const elements = doc.querySelectorAll(selector.value);
      const uniquenessScore = elements.length === 0 ? 0 : 
        elements.length === 1 ? 20 : 
        Math.max(0, 20 - elements.length);

      score.factors.push({
        name: 'Selector Uniqueness',
        score: uniquenessScore,
        description: `Matches ${elements.length} elements`
      });
    } catch (error) {
      logger.warn(`Error checking selector uniqueness: ${error.message}`);
    }
  }

  /**
   * Add recommendations based on analysis
   */
  addRecommendations(selector, score) {
    const recommendations = [];

    if (score.value < 50) {
      if (selector.type === 'css') {
        if (!selector.value.includes('[')) {
          recommendations.push('Consider using attribute selectors for more stability');
        }
        if (selector.value.includes('nth-child')) {
          recommendations.push('Avoid position-based selectors when possible');
        }
      } else if (selector.type === 'xpath') {
        recommendations.push('Consider providing a CSS selector alternative');
      }
    }

    score.recommendation = recommendations.join('. ');
  }

  /**
   * Get stability level based on score
   */
  getStabilityLevel(score) {
    if (score >= 80) return 'High';
    if (score >= 60) return 'Medium';
    return 'Low';
  }

  /**
   * Analyze XPath complexity
   */
  analyzeXPathComplexity(xpath) {
    let complexity = 0;
    
    // Check for position predicates
    complexity += (xpath.match(/\[\d+\]/g) || []).length;
    
    // Check for complex functions
    const complexFunctions = ['contains', 'starts-with', 'ends-with', 'substring'];
    complexity += complexFunctions.filter(func => xpath.includes(func)).length;
    
    // Check for multiple conditions
    complexity += (xpath.match(/and|or/g) || []).length;
    
    return complexity;
  }
}

module.exports = new SelectorAnalyzer();
