export type AnalyticsKpis = {
  pending_reviews: number;
  high_impact_pending: number;
  redlines_ready: number;
  overdue_reviews: number;
  approved_this_month: number;
  open_high_gaps: number;
};

export type GapImpactTimePoint = {
  period_start: string;
  period_label: string;
  high: number;
  medium: number;
  info: number;
};

export type PolicyCoverageItem = {
  policy_id: string;
  policy_name: string;
  open_high_gaps: number;
  open_medium_gaps: number;
  worst_impact: string | null;
};

export type SimilarityHistogramBucket = {
  label: string;
  min_score: number;
  max_score: number;
  count: number;
};

export type ComplianceHistoryTimePoint = {
  period_start: string;
  period_label: string;
  incidents: number;
};

export type ComplianceHistoryPolicyItem = {
  policy_name: string;
  incident_count: number;
};

export type AnalyticsInsights = {
  compliance_score: number;
  compliant_policies: number;
  total_internal_policies: number;
  open_high_gaps: number;
  open_medium_gaps: number;
  redline_internal_histogram: SimilarityHistogramBucket[];
  redline_regulator_histogram: SimilarityHistogramBucket[];
  average_redline_internal_similarity: number | null;
  average_redline_regulator_similarity: number | null;
  redline_internal_sample_size: number;
  redline_regulator_sample_size: number;
};

export type AnalyticsDashboardResponse = {
  kpis: AnalyticsKpis;
  gaps_by_impact_over_time: GapImpactTimePoint[];
  policy_coverage: PolicyCoverageItem[];
  compliance_history_over_time: ComplianceHistoryTimePoint[];
  compliance_history_top_policies: ComplianceHistoryPolicyItem[];
  insights: AnalyticsInsights;
};
