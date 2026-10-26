/**
 * Reglas de licencia de conducir (Ley 431 Arts. 140-147).
 */

import { resolveRuleConfig } from '../codes';
import {
  compareDates,
  isExpired,
  isExpiringSoon,
  isNotYetValid,
  daysUntilExpiration,
  toDateOnly,
} from '../dateUtils';
import type { ComplianceFacts, ComplianceReason, RuleContext } from '../types';
import { docStatusReason, passReason, reason } from './ruleUtils';

export function evaluateLicense(
  facts: ComplianceFacts,
  ctx: RuleContext,
): ComplianceReason[] {
  const reasons: ComplianceReason[] = [];
  const license = facts.license;

  if (!license) {
    reasons.push(
      reason(ctx, 'LICENSE_MISSING', 'No hay licencia de conducir registrada'),
    );
    return reasons;
  }

  const statusReason = docStatusReason(ctx, license, 'Licencia de conducir');
  if (statusReason) reasons.push(statusReason);

  if (license.reportedStatus === 'suspended' || license.reportedStatus === 'canceled') {
    reasons.push(
      reason(
        ctx,
        'LICENSE_REPORTED_SUSPENDED',
        `Licencia reportada como ${license.reportedStatus === 'suspended' ? 'suspendida' : 'cancelada'} por la autoridad`,
      ),
    );
  }

  const issue = toDateOnly(license.issueDate);
  const expiry = toDateOnly(license.expiryDate);

  if (issue && expiry && compareDates(issue, expiry) > 0) {
    reasons.push(
      reason(
        ctx,
        'LICENSE_INVALID_DATE_RANGE',
        `Fecha de emisión (${issue}) posterior a vencimiento (${expiry})`,
        'fail',
        { issueDate: issue, expiryDate: expiry },
      ),
    );
  } else {
    if (isNotYetValid(issue, ctx.today)) {
      reasons.push(
        reason(
          ctx,
          'LICENSE_NOT_YET_VALID',
          `Licencia con emisión futura (${issue})`,
          'fail',
          { issueDate: issue },
        ),
      );
    }

    if (!expiry) {
      reasons.push(
        reason(
          ctx,
          'DOCUMENT_DATA_INCOMPLETE',
          'Licencia sin fecha de vencimiento legible',
          'review',
          { documentKind: 'license' },
        ),
      );
    } else if (isExpired(expiry, ctx.today)) {
      reasons.push(
        reason(
          ctx,
          'LICENSE_EXPIRED',
          `Licencia vencida el ${expiry}`,
          'fail',
          { expiryDate: expiry },
        ),
      );
    } else {
      const cfg = resolveRuleConfig('LICENSE_EXPIRING_SOON', ctx.rules);
      const warningDays = cfg.warningDays ?? 30;
      if (isExpiringSoon(expiry, ctx.today, warningDays)) {
        reasons.push(
          reason(
            ctx,
            'LICENSE_EXPIRING_SOON',
            `Licencia vence el ${expiry} (en ${daysUntilExpiration(expiry, ctx.today)} días)`,
            'warning',
            { expiryDate: expiry, daysUntil: daysUntilExpiration(expiry, ctx.today) },
          ),
        );
      } else {
        reasons.push(
          passReason('LICENSE_VALID', `Licencia vigente hasta ${expiry}`, {
            expiryDate: expiry,
          }),
        );
      }
    }
  }

  if (license.licenseType === 'ordinaria') {
    reasons.push(
      reason(
        ctx,
        'LICENSE_TYPE_ORDINARY_FOR_PAID_WORK',
        'Licencia ordinaria para trabajo remunerado (revisar si se exigirá profesional)',
        'warning',
        { licenseType: license.licenseType },
      ),
    );
  }

  return reasons;
}
