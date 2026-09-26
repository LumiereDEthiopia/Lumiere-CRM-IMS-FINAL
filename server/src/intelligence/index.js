/**
 * Intelligence Engine — unified public facade.
 * Re-exports analytics from the specialised modules below.
 */
import * as service from './service.js'
import * as businessAnalytics from './businessAnalytics.js'
import * as customerIntel from './customerIntelligence.js'
import * as purchasing from './purchasingRecommendations.js'
import * as executive from './executive.js'

// Inventory intelligence
export const getInventoryIntelligence = service.getInventoryIntelligence
export const getInventoryAlerts = service.getInventoryAlerts
export const getInventoryForecast = service.getInventoryForecast
export const getInventoryRecommendations = purchasing.getPurchasingRecommendations

// Product / financial / employee / location analytics
export const getProductIntelligence = businessAnalytics.getProductIntelligence
export const getProductIntelligenceDetail = executive.getProductIntelligenceDetail
export const getProfitIntelligence = businessAnalytics.getProfitIntelligence
export const getEmployeeIntelligence = businessAnalytics.getEmployeeIntelligence
export const getLocationIntelligence = businessAnalytics.getLocationIntelligence
export const getLocationIntelligenceDetail = executive.getLocationIntelligenceDetail

// Customer intelligence (RFM / segments / churn / alerts)
export const getCustomerIntelligence = service.getCustomerIntelligence
export const getRfmAnalysis = customerIntel.getRfmAnalysis
export const getCustomerSegments = customerIntel.getCustomerSegments
export const getChurnRisk = executive.getChurnRisk
export const getCustomerAlerts = customerIntel.getCustomerAlerts

// Executive / management layer
export const getManagementForecast = executive.getManagementForecast
export const getExecutiveDashboard = executive.getExecutiveDashboard

// Unified recommendations + assistant
export const getUnifiedRecommendations = executive.getUnifiedRecommendations
export const resolveUnifiedRecommendation = executive.resolveUnifiedRecommendation
export const generateRecommendationsFromIntelligence = executive.generateRecommendationsFromIntelligence
export const askAssistant = executive.askAssistant

// Re-export shared helpers used elsewhere
export const generateIntelligenceSnapshot = service.generateIntelligenceSnapshot
export const rfmSegment = customerIntel.rfmSegment