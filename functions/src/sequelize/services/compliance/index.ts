/**
 * Barrel del motor de compliance documental.
 */

export { ComplianceService, complianceService } from './ComplianceService';
export { evaluateFacts, summarizeEvaluation, buildContext, RULES_VERSION } from './evaluator';
export { ComplianceRepository } from './ComplianceRepository';
export * from './types';
export * from './codes';
export * as complianceDateUtils from './dateUtils';
