/**
 * Narrative Engine — Auto-generated plain-English analytical summaries.
 * Provides "smart insights" for each analytics view.
 * All functions are pure with no side effects.
 */

// ============================================================
// TYPES
// ============================================================

export interface NarrativeInsight {
  id: string;
  type: "positive" | "warning" | "neutral" | "opportunity";
  title: string;
  body: string;
  metric?: string;
  actionable?: string;
  priority: number;
}

// ============================================================
// HELPERS
// ============================================================

function pct(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function fmtN(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function fmtCurrency(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars);
}

function fmtCurrencyCompact(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(dollars);
}

/** Sort by priority ascending, then cap at maxInsights. */
function finalizeInsights(insights: NarrativeInsight[], maxInsights: number = 5): NarrativeInsight[] {
  return insights
    .sort((a, b) => {
      const typeOrder: Record<NarrativeInsight["type"], number> = {
        warning: 0,
        opportunity: 1,
        positive: 2,
        neutral: 3,
      };
      const typeDiff = typeOrder[a.type] - typeOrder[b.type];
      if (typeDiff !== 0) return typeDiff;
      return a.priority - b.priority;
    })
    .slice(0, maxInsights);
}

let insightCounter = 0;
function nextId(prefix: string): string {
  insightCounter++;
  return `${prefix}-${insightCounter}`;
}

// ============================================================
// 1. FEASIBILITY NARRATIVE
// ============================================================

export function generateFeasibilityNarrative(
  totalPatients: number,
  matchingPatients: number,
  matchRate: number,
  criterionBreakdown: { criterion: string; matchCount: number; matchRate: number }[],
  demographics: { avgAge: number; genderSplit: { male: number; female: number; other: number } },
): NarrativeInsight[] {
  const insights: NarrativeInsight[] = [];

  // Overall match summary
  const matchPctStr = fmtPct(matchRate * 100);
  insights.push({
    id: nextId("feas"),
    type: matchRate >= 0.1 ? "positive" : matchRate >= 0.05 ? "neutral" : "warning",
    title: `${fmtN(matchingPatients)} eligible subjects identified`,
    body: `Your site has ${fmtN(matchingPatients)} subjects (${matchPctStr}) matching this protocol from a population of ${fmtN(totalPatients)}.`,
    metric: matchPctStr,
    priority: 1,
  });

  // Bottleneck identification — find the criterion with the lowest match rate
  if (criterionBreakdown.length > 0) {
    const sorted = [...criterionBreakdown].sort((a, b) => a.matchRate - b.matchRate);
    const blocker = sorted[0];
    if (blocker) {
      const nonMatchCount = totalPatients - blocker.matchCount;
      const potentialGain = Math.min(nonMatchCount, totalPatients - matchingPatients);
      if (potentialGain > 0 && blocker.matchRate < 0.8) {
        insights.push({
          id: nextId("feas"),
          type: "opportunity",
          title: `Top enrollment blocker: ${blocker.criterion}`,
          body: `The top enrollment blocker is '${blocker.criterion}' — removing it would add up to ${fmtN(potentialGain)} potential candidates (+${Math.round(pct(potentialGain, Math.max(matchingPatients, 1)))}%).`,
          metric: fmtPct(blocker.matchRate * 100),
          actionable: "Review whether this criterion can be amended or if a protocol deviation waiver applies.",
          priority: 2,
        });
      }
    }
  }

  // Very low feasibility warning
  if (matchRate < 0.05) {
    insights.push({
      id: nextId("feas"),
      type: "warning",
      title: "Feasibility concern",
      body: `A ${matchPctStr} match rate is below the 5% threshold typically required for viable enrollment. This study may require a larger catchment area or amended criteria.`,
      actionable: "Consider discussing eligibility amendments with the sponsor or expanding patient referral sources.",
      priority: 1,
    });
  }

  // High feasibility opportunity
  if (matchRate > 0.25) {
    insights.push({
      id: nextId("feas"),
      type: "opportunity",
      title: "Strong feasibility signal",
      body: `A ${matchPctStr} match rate significantly exceeds the typical 10-15% benchmark. This site is well-positioned for competitive enrollment.`,
      actionable: "Highlight this match rate in sponsor feasibility questionnaires to strengthen your bid.",
      priority: 2,
    });
  }

  // Gender imbalance detection
  const totalGender = demographics.genderSplit.male + demographics.genderSplit.female + demographics.genderSplit.other;
  if (totalGender > 0) {
    const malePct = pct(demographics.genderSplit.male, totalGender);
    const femalePct = pct(demographics.genderSplit.female, totalGender);
    if (malePct > 70 || femalePct > 70) {
      const dominant = malePct > femalePct ? "male" : "female";
      const dominantPct = Math.max(malePct, femalePct);
      insights.push({
        id: nextId("feas"),
        type: "warning",
        title: "Gender imbalance in eligible cohort",
        body: `The eligible cohort is ${Math.round(dominantPct)}% ${dominant}. FDA diversity guidelines recommend balanced representation.`,
        actionable: "Review whether protocol criteria disproportionately exclude one gender and document justification if so.",
        priority: 3,
      });
    }
  }

  // Age insight
  if (demographics.avgAge > 0 && matchingPatients > 0) {
    const ageType = demographics.avgAge >= 55
      ? "which aligns with the typical Phase III population"
      : demographics.avgAge >= 40
        ? "indicating a mid-age cohort suitable for most adult trials"
        : "reflecting a relatively young eligible cohort";
    insights.push({
      id: nextId("feas"),
      type: "neutral",
      title: `Average eligible age: ${demographics.avgAge} years`,
      body: `Average eligible age is ${demographics.avgAge} years, ${ageType}.`,
      metric: `${demographics.avgAge} yrs`,
      priority: 4,
    });
  }

  return finalizeInsights(insights);
}

// ============================================================
// 2. ENROLLMENT FORECAST NARRATIVE
// ============================================================

export function generateEnrollmentNarrative(
  config: { targetEnrollment: number; months: number; eligiblePool: number },
  result: {
    medianTimeToTarget: number | null;
    probabilityOfSuccess: number;
    expectedEnrolled: number;
    timeline: { month: number; p50: number }[];
  },
): NarrativeInsight[] {
  const insights: NarrativeInsight[] = [];

  // Probability of reaching target
  const probPct = fmtPct(result.probabilityOfSuccess);
  insights.push({
    id: nextId("enrl"),
    type: result.probabilityOfSuccess >= 0.7 ? "positive" : result.probabilityOfSuccess >= 0.5 ? "neutral" : "warning",
    title: `${probPct} probability of reaching enrollment target`,
    body: `At current rates, you have a ${probPct} probability of reaching your enrollment target of ${fmtN(config.targetEnrollment)} subjects within ${config.months} months.`,
    metric: probPct,
    priority: 1,
  });

  // Median time to target
  if (result.medianTimeToTarget !== null) {
    const fastest = Math.max(1, Math.round(result.medianTimeToTarget * 0.6));
    insights.push({
      id: nextId("enrl"),
      type: "neutral",
      title: `Median time to target: ${result.medianTimeToTarget.toFixed(1)} months`,
      body: `The median time to full enrollment is ${result.medianTimeToTarget.toFixed(1)} months. The fastest 10% of scenarios complete in approximately ${fastest} months.`,
      metric: `${result.medianTimeToTarget.toFixed(1)} mo`,
      priority: 2,
    });
  }

  // At-risk enrollment
  if (result.probabilityOfSuccess < 0.5) {
    insights.push({
      id: nextId("enrl"),
      type: "warning",
      title: "Enrollment is at risk",
      body: `With a ${probPct} success probability, reaching ${fmtN(config.targetEnrollment)} subjects within ${config.months} months is unlikely under current conditions.`,
      actionable: "Consider expanding eligibility criteria, increasing screening capacity, or extending the enrollment window.",
      priority: 1,
    });
  }

  // Strong enrollment signal
  if (result.probabilityOfSuccess >= 0.85) {
    insights.push({
      id: nextId("enrl"),
      type: "positive",
      title: "High enrollment confidence",
      body: `A ${probPct} success probability indicates strong enrollment confidence. Your site is likely to meet or exceed targets ahead of schedule.`,
      priority: 3,
    });
  }

  // Velocity insight from timeline
  if (result.timeline.length >= 4) {
    let peakVelocity = 0;
    let peakStart = 0;
    let peakEnd = 0;
    for (let i = 1; i < result.timeline.length; i++) {
      const prev = result.timeline[i - 1];
      const curr = result.timeline[i];
      if (prev && curr) {
        const velocity = curr.p50 - prev.p50;
        if (velocity > peakVelocity) {
          peakVelocity = velocity;
          peakStart = prev.month;
          peakEnd = curr.month;
        }
      }
    }
    if (peakVelocity > 0 && peakStart <= Math.ceil(result.timeline.length / 2)) {
      insights.push({
        id: nextId("enrl"),
        type: "neutral",
        title: "Front-loaded recruitment pattern",
        body: `Peak enrollment velocity occurs in months ${peakStart + 1}-${peakEnd + 1}, suggesting front-loaded recruitment from the existing patient pool.`,
        priority: 4,
      });
    }
  }

  // Pool adequacy
  if (config.eligiblePool > 0) {
    const poolRatio = config.eligiblePool / config.targetEnrollment;
    if (poolRatio < 2) {
      insights.push({
        id: nextId("enrl"),
        type: "warning",
        title: "Thin eligible pool",
        body: `Your eligible pool of ${fmtN(config.eligiblePool)} subjects is only ${poolRatio.toFixed(1)}x your enrollment target. A ratio below 2x leaves little margin for consent refusals and screen failures.`,
        actionable: "Aim for a pool-to-target ratio of at least 3x to account for ~45% consent rates and ~30% screen failure.",
        priority: 2,
      });
    }
  }

  return finalizeInsights(insights);
}

// ============================================================
// 3. DIVERSITY NARRATIVE
// ============================================================

export function generateDiversityNarrative(
  diversityScore: number,
  genderSplit: Record<string, number>,
  raceSplit: Record<string, number>,
  ageBuckets: Record<string, number>,
  totalPatients: number,
): NarrativeInsight[] {
  const insights: NarrativeInsight[] = [];

  if (totalPatients === 0) {
    insights.push({
      id: nextId("div"),
      type: "neutral",
      title: "No patient data available",
      body: "Import patient data to generate diversity insights.",
      priority: 1,
    });
    return insights;
  }

  // Score summary
  const scoreType: NarrativeInsight["type"] = diversityScore >= 70 ? "positive" : diversityScore >= 50 ? "neutral" : "warning";
  const scoreDesc = diversityScore >= 80
    ? "strong demographic representation"
    : diversityScore >= 60
      ? "moderate demographic representation with room for improvement"
      : "limited demographic diversity — targeted outreach recommended";
  insights.push({
    id: nextId("div"),
    type: scoreType,
    title: `Diversity score: ${diversityScore}/100`,
    body: `Your diversity score of ${diversityScore}/100 indicates ${scoreDesc}.`,
    metric: `${diversityScore}/100`,
    priority: 1,
  });

  // FDA guideline gap detection — Hispanic/Latino
  const hispanicCount = Object.entries(raceSplit)
    .filter(([label]) => label.toLowerCase().includes("hispanic") || label.toLowerCase().includes("latino"))
    .reduce((sum, [, count]) => sum + count, 0);
  const hispanicPct = pct(hispanicCount, totalPatients);
  if (hispanicPct < 10) {
    insights.push({
      id: nextId("div"),
      type: "warning",
      title: "Hispanic/Latino underrepresentation",
      body: `Hispanic/Latino representation is ${fmtPct(hispanicPct)}, below the FDA's 10% guideline. Consider targeted outreach to improve enrollment diversity.`,
      actionable: "Partner with community health centers or bilingual coordinators to reach Hispanic/Latino populations.",
      priority: 2,
    });
  }

  // FDA guideline gap detection — Black/African American
  const blackCount = raceSplit["Black or African American"] ?? 0;
  const blackPct = pct(blackCount, totalPatients);
  if (blackPct < 13) {
    insights.push({
      id: nextId("div"),
      type: blackPct < 8 ? "warning" : "neutral",
      title: `Black/African American representation: ${fmtPct(blackPct)}`,
      body: `Black/African American representation is ${fmtPct(blackPct)}, ${blackPct < 8 ? "well below" : "slightly below"} the US census proportion of 13.6%.`,
      actionable: blackPct < 8 ? "Consider community engagement strategies to improve representation." : undefined,
      priority: 2,
    });
  }

  // Age distribution — elderly representation
  const totalInBuckets = Object.values(ageBuckets).reduce((s, c) => s + c, 0);
  if (totalInBuckets > 0) {
    const elderlyKeys = Object.keys(ageBuckets).filter((k) => {
      const match = k.match(/(\d+)/);
      return match && match[1] ? parseInt(match[1], 10) >= 65 : false;
    });
    const elderlyCount = elderlyKeys.reduce((s, k) => s + (ageBuckets[k] ?? 0), 0);
    const elderlyPct = pct(elderlyCount, totalInBuckets);
    if (elderlyPct >= 20) {
      insights.push({
        id: nextId("div"),
        type: "positive",
        title: `${Math.round(elderlyPct)}% of population aged 65+`,
        body: `${Math.round(elderlyPct)}% of your population is over 65, providing strong elderly subgroup data for geriatric safety analysis.`,
        metric: fmtPct(elderlyPct),
        priority: 3,
      });
    }
  }

  // Racial diversity benchmark comparison
  const raceCategories = Object.keys(raceSplit).filter((k) => k !== "Unknown" && k !== "Other");
  const benchmarkMet = raceCategories.filter((cat) => {
    const catPct = pct(raceSplit[cat] ?? 0, totalPatients);
    // Rough US clinical trial benchmarks
    const benchmarks: Record<string, number> = {
      "White": 60,
      "Black or African American": 8,
      "Asian": 4,
      "Hispanic or Latino": 8,
      "American Indian or Alaska Native": 1,
    };
    const benchmark = benchmarks[cat];
    return benchmark !== undefined && catPct >= benchmark;
  });
  if (benchmarkMet.length >= 3) {
    insights.push({
      id: nextId("div"),
      type: "positive",
      title: "Exceeds national trial benchmarks",
      body: `Racial diversity exceeds national clinical trial benchmarks in ${benchmarkMet.length} of ${raceCategories.length} categories.`,
      priority: 3,
    });
  }

  // Gender balance
  const maleCount = genderSplit["Male"] ?? 0;
  const femaleCount = genderSplit["Female"] ?? 0;
  const totalGender = maleCount + femaleCount + (genderSplit["Other"] ?? 0);
  if (totalGender > 0) {
    const femalePct = pct(femaleCount, totalGender);
    if (femalePct >= 40 && femalePct <= 60) {
      insights.push({
        id: nextId("div"),
        type: "positive",
        title: "Balanced gender distribution",
        body: `Gender split is ${Math.round(femalePct)}% female / ${Math.round(100 - femalePct)}% male, meeting FDA balanced representation guidelines.`,
        priority: 4,
      });
    } else {
      const dominant = femalePct > 50 ? "female" : "male";
      insights.push({
        id: nextId("div"),
        type: "warning",
        title: "Gender imbalance detected",
        body: `Population skews ${Math.round(Math.max(femalePct, 100 - femalePct))}% ${dominant}. Consider whether protocol criteria drive this imbalance.`,
        priority: 3,
      });
    }
  }

  return finalizeInsights(insights);
}

// ============================================================
// 4. PERFORMANCE NARRATIVE
// ============================================================

export function generatePerformanceNarrative(
  studies: { name: string; passRate: number; eligible: number; revenue: number }[],
  overallScreened: number,
  overallEligible: number,
): NarrativeInsight[] {
  const insights: NarrativeInsight[] = [];

  if (studies.length === 0) {
    insights.push({
      id: nextId("perf"),
      type: "neutral",
      title: "No active studies",
      body: "Add studies to see performance insights and cross-study analytics.",
      priority: 1,
    });
    return insights;
  }

  // Overall pass rate
  const overallPassRate = overallScreened > 0 ? pct(overallEligible, overallScreened) : 0;
  insights.push({
    id: nextId("perf"),
    type: overallPassRate >= 20 ? "positive" : overallPassRate >= 10 ? "neutral" : "warning",
    title: `${Math.round(overallPassRate)}% overall pass rate across ${studies.length} ${studies.length === 1 ? "study" : "studies"}`,
    body: `Across ${studies.length} active ${studies.length === 1 ? "study" : "studies"}, your site has screened ${fmtN(overallScreened)} subjects with a ${fmtPct(overallPassRate)} overall pass rate.`,
    metric: fmtPct(overallPassRate),
    priority: 1,
  });

  // Highest-value study
  const sorted = [...studies].sort((a, b) => b.revenue - a.revenue);
  const topStudy = sorted[0];
  if (topStudy && topStudy.revenue > 0) {
    const perSubject = topStudy.eligible > 0
      ? fmtCurrency(Math.round(topStudy.revenue / topStudy.eligible))
      : "N/A";
    insights.push({
      id: nextId("perf"),
      type: "opportunity",
      title: `${topStudy.name} is your highest-value study`,
      body: `${topStudy.name} is your highest-value study at ${perSubject}/subject with ${fmtN(topStudy.eligible)} eligible candidates.`,
      metric: fmtCurrencyCompact(topStudy.revenue),
      priority: 2,
    });
  }

  // Screen failure intelligence — find study with lowest pass rate
  const lowestPassStudy = [...studies].sort((a, b) => a.passRate - b.passRate)[0];
  if (lowestPassStudy && lowestPassStudy.passRate < 0.15 && studies.length > 1) {
    insights.push({
      id: nextId("perf"),
      type: "warning",
      title: `${lowestPassStudy.name}: high screen failure rate`,
      body: `${lowestPassStudy.name} has only a ${fmtPct(lowestPassStudy.passRate * 100)} pass rate, significantly below your site average. Review eligibility criteria alignment with your patient population.`,
      actionable: "Analyze which specific criteria drive the most screen failures and discuss with the sponsor.",
      priority: 2,
    });
  }

  // Total revenue projection
  const totalRevenue = studies.reduce((sum, s) => sum + s.revenue, 0);
  if (totalRevenue > 0) {
    insights.push({
      id: nextId("perf"),
      type: "neutral",
      title: `Projected revenue: ${fmtCurrencyCompact(totalRevenue)}`,
      body: `Total projected revenue across all studies is ${fmtCurrency(totalRevenue)} at current enrollment rates.`,
      metric: fmtCurrencyCompact(totalRevenue),
      priority: 3,
    });
  }

  // Underperforming studies
  const underperformers = studies.filter((s) => s.passRate < 0.1);
  if (underperformers.length > 1) {
    insights.push({
      id: nextId("perf"),
      type: "warning",
      title: `${underperformers.length} studies with pass rates below 10%`,
      body: `${underperformers.length} of ${studies.length} studies have pass rates below 10%: ${underperformers.map((s) => s.name).join(", ")}. Consider whether these protocols are a good fit for your patient population.`,
      actionable: "Review site feasibility for low-performing studies and reallocate screening resources to higher-yield protocols.",
      priority: 2,
    });
  }

  return finalizeInsights(insights);
}

// ============================================================
// 5. SITE READINESS NARRATIVE
// ============================================================

export function generateReadinessNarrative(
  score: number,
  subScores: { name: string; score: number; weight: number }[],
  patientCount: number,
): NarrativeInsight[] {
  const insights: NarrativeInsight[] = [];

  // Overall readiness
  const readinessLevel = score >= 85
    ? "highly competitive for new study placements"
    : score >= 70
      ? "well-positioned for most clinical trials"
      : score >= 50
        ? "meeting baseline requirements but has improvement areas"
        : "below typical sponsor expectations for site selection";
  insights.push({
    id: nextId("ready"),
    type: score >= 70 ? "positive" : score >= 50 ? "neutral" : "warning",
    title: `Site readiness score: ${score}/100`,
    body: `Your overall readiness score of ${score}/100 indicates your site is ${readinessLevel}.`,
    metric: `${score}/100`,
    priority: 1,
  });

  // Weakest sub-score
  if (subScores.length > 0) {
    const sorted = [...subScores].sort((a, b) => a.score - b.score);
    const weakest = sorted[0];
    if (weakest && weakest.score < 70) {
      insights.push({
        id: nextId("ready"),
        type: "warning",
        title: `Improvement area: ${weakest.name}`,
        body: `'${weakest.name}' scored ${weakest.score}/100 (weight: ${Math.round(weakest.weight * 100)}%), making it your primary area for improvement.`,
        actionable: `Focus on improving '${weakest.name}' to raise your overall readiness score.`,
        priority: 2,
      });
    }

    // Strongest sub-score
    const strongest = sorted[sorted.length - 1];
    if (strongest && strongest.score >= 85) {
      insights.push({
        id: nextId("ready"),
        type: "positive",
        title: `Strength: ${strongest.name}`,
        body: `'${strongest.name}' is your top-performing dimension at ${strongest.score}/100. Highlight this in sponsor feasibility questionnaires.`,
        priority: 3,
      });
    }
  }

  // Patient volume
  if (patientCount > 0) {
    const volumeType = patientCount >= 500
      ? "large" : patientCount >= 200
        ? "moderate" : "small";
    insights.push({
      id: nextId("ready"),
      type: patientCount >= 200 ? "positive" : "neutral",
      title: `Patient population: ${fmtN(patientCount)}`,
      body: `Your site has a ${volumeType} patient population of ${fmtN(patientCount)}, ${patientCount >= 200 ? "supporting feasibility across multiple therapeutic areas" : "which may limit multi-study participation"}.`,
      metric: fmtN(patientCount),
      priority: 4,
    });
  }

  // All sub-scores above 80 — competitive advantage
  if (subScores.length > 0 && subScores.every((s) => s.score >= 80)) {
    insights.push({
      id: nextId("ready"),
      type: "opportunity",
      title: "Consistently high performance",
      body: `All ${subScores.length} readiness dimensions score above 80/100. This consistency is a strong differentiator in competitive site selection.`,
      priority: 3,
    });
  }

  return finalizeInsights(insights);
}

// ============================================================
// 6. COHORT NARRATIVE
// ============================================================

export function generateCohortNarrative(
  totalPopulation: number,
  matchingCount: number,
  criteriaCount: number,
  topBlocker: string | null,
  demographics: { avgAge: number; malePercent: number; topRace: string; topRacePercent: number },
): NarrativeInsight[] {
  const insights: NarrativeInsight[] = [];

  if (totalPopulation === 0) {
    insights.push({
      id: nextId("cohort"),
      type: "neutral",
      title: "No population data",
      body: "Import patient data to generate cohort analysis insights.",
      priority: 1,
    });
    return insights;
  }

  // Cohort summary
  const matchPct = pct(matchingCount, totalPopulation);
  insights.push({
    id: nextId("cohort"),
    type: matchPct >= 10 ? "positive" : matchPct >= 5 ? "neutral" : "warning",
    title: `${fmtN(matchingCount)} of ${fmtN(totalPopulation)} subjects match ${criteriaCount} criteria`,
    body: `${fmtN(matchingCount)} subjects (${fmtPct(matchPct)}) from your population of ${fmtN(totalPopulation)} meet all ${criteriaCount} eligibility criteria.`,
    metric: fmtPct(matchPct),
    priority: 1,
  });

  // Top blocker
  if (topBlocker) {
    insights.push({
      id: nextId("cohort"),
      type: "opportunity",
      title: `Primary screening bottleneck: ${topBlocker}`,
      body: `'${topBlocker}' is the criterion excluding the most subjects. Evaluate whether protocol amendments or alternative assessments could recover candidates.`,
      actionable: "Discuss with the medical monitor whether this criterion can be relaxed or assessed differently.",
      priority: 2,
    });
  }

  // Demographics — age
  if (demographics.avgAge > 0) {
    insights.push({
      id: nextId("cohort"),
      type: "neutral",
      title: `Average cohort age: ${demographics.avgAge} years`,
      body: `The matching cohort averages ${demographics.avgAge} years old, with a ${Math.round(demographics.malePercent)}% male / ${Math.round(100 - demographics.malePercent)}% female split.`,
      metric: `${demographics.avgAge} yrs`,
      priority: 3,
    });
  }

  // Demographics — racial composition
  if (demographics.topRace && demographics.topRacePercent > 0) {
    const raceInsightType: NarrativeInsight["type"] = demographics.topRacePercent > 80 ? "warning" : "neutral";
    insights.push({
      id: nextId("cohort"),
      type: raceInsightType,
      title: `${demographics.topRace}: ${Math.round(demographics.topRacePercent)}% of cohort`,
      body: demographics.topRacePercent > 80
        ? `The cohort is ${Math.round(demographics.topRacePercent)}% ${demographics.topRace}, indicating limited racial diversity. FDA draft guidance recommends representative enrollment.`
        : `${demographics.topRace} represents ${Math.round(demographics.topRacePercent)}% of the eligible cohort.`,
      actionable: demographics.topRacePercent > 80 ? "Consider diversity-focused outreach to improve cohort representativeness." : undefined,
      priority: demographics.topRacePercent > 80 ? 2 : 4,
    });
  }

  // Small cohort warning
  if (matchingCount > 0 && matchingCount < 10) {
    insights.push({
      id: nextId("cohort"),
      type: "warning",
      title: "Very small eligible cohort",
      body: `Only ${matchingCount} subjects meet all criteria. With typical consent rates (~45%) and screen failure rates (~30%), you may enroll ${Math.max(1, Math.round(matchingCount * 0.45 * 0.7))} subjects from this pool.`,
      actionable: "Consider whether additional patient sources or referral networks can supplement the eligible pool.",
      priority: 1,
    });
  }

  return finalizeInsights(insights);
}
