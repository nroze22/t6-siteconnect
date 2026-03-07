# Skill: Three-Panel Screening Interface

> **This is the HERO UI of the entire application. It must look and feel like a
> billion-dollar product.**
>
> The three-panel screening interface is the primary workspace where site staff
> review patient eligibility against clinical trial criteria. Every pixel, every
> interaction, every animation must communicate precision, confidence, and
> clinical authority.

---

## Table of Contents

1. [Layout Architecture](#layout-architecture)
2. [Left Panel -- Patient Rank List](#left-panel----patient-rank-list)
3. [Middle Panel -- Patient Detail & Criteria](#middle-panel----patient-detail--criteria)
4. [Right Panel -- Source Data Viewer](#right-panel----source-data-viewer)
5. [Interactive Highlighting](#interactive-highlighting)
6. [Study Detail Slide-Out](#study-detail-slide-out)
7. [State Management (Zustand)](#state-management-zustand)
8. [Interaction Patterns](#interaction-patterns)
9. [Keyboard Navigation](#keyboard-navigation)
10. [Design System](#design-system)
11. [Accessibility](#accessibility)
12. [Performance](#performance)
13. [Component Reference](#component-reference)
14. [Testing](#testing)

---

## Layout Architecture

### Three Resizable Panels

```
+------------------+----------------------------+--------------------+
|  Left Panel      |    Middle Panel             |   Right Panel      |
|  Patient List    |    Criteria Detail           |   Source Data      |
|  (~250px)        |    (flex: 1)                 |   (~350px)         |
|                  |                              |                    |
|  Rank | ID | Age |  [Patient Header Card]       |  [Tabs]            |
|  #1   | 101| 54  |                              |  Demographics |    |
|  #2   | 203| 67  |  Score: 87/100 [====]        |  Diagnoses    |    |
|  #3   | 105| 45  |                              |  Medications  |    |
|       ...        |  Inclusion Criteria:          |  Labs         |    |
|                  |  [1] Age >= 18 [MET]          |  Vitals       |    |
|                  |  [2] NSCLC dx  [MET] <-click  |  Notes        |    |
|                  |  [3] ECOG 0-1  [UNKNOWN]      |               |    |
|                  |                              |  >> C34.1 HL  |    |
|                  |  Exclusion Criteria:          |  >> highlighted|    |
|                  |  [1] Prior IO [NOT MET]       |               |    |
|                  |                              |               |    |
|  [Search/Filter] |  [Accept] [Reject] [Defer]   |  [View Study] |    |
+------------------+----------------------------+--------------------+
```

### Root Layout Component

```typescript
// frontend/src/components/screening/ScreeningLayout.tsx

import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels';

export function ScreeningLayout() {
  return (
    <div className="h-screen flex flex-col bg-[#FAFAFA]">
      {/* Top bar: study selector + LLM status */}
      <ScreeningTopBar />

      {/* Three-panel workspace */}
      <PanelGroup
        direction="horizontal"
        className="flex-1 min-h-0"
        autoSaveId="screening-panels"
      >
        {/* Left Panel: Patient Rank List */}
        <Panel
          defaultSize={20}
          minSize={15}
          maxSize={30}
          className="border-r border-gray-200"
        >
          <PatientRankPanel />
        </Panel>

        <PanelResizeHandle className="w-px bg-gray-200 hover:bg-blue-400 hover:w-1 transition-all cursor-col-resize" />

        {/* Middle Panel: Criteria Detail */}
        <Panel
          defaultSize={50}
          minSize={35}
          className="border-r border-gray-200"
        >
          <CriteriaDetailPanel />
        </Panel>

        <PanelResizeHandle className="w-px bg-gray-200 hover:bg-blue-400 hover:w-1 transition-all cursor-col-resize" />

        {/* Right Panel: Source Data */}
        <Panel
          defaultSize={30}
          minSize={20}
          maxSize={40}
        >
          <SourceDataPanel />
        </Panel>
      </PanelGroup>
    </div>
  );
}
```

### Top Bar

```typescript
// frontend/src/components/screening/ScreeningTopBar.tsx

export function ScreeningTopBar() {
  const { selectedStudyId, studies } = useScreeningStore();

  return (
    <div className="h-12 px-4 flex items-center justify-between border-b border-gray-200 bg-white">
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-semibold text-gray-900">
          Patient Screening
        </h1>
        <StudySelector
          studies={studies}
          selectedId={selectedStudyId}
          onChange={(id) => useScreeningStore.getState().selectStudy(id)}
        />
      </div>

      <div className="flex items-center gap-4">
        <ScreeningProgress />
        <LlmStatusBar className="text-xs" />
      </div>
    </div>
  );
}
```

---

## Left Panel -- Patient Rank List

### Component Hierarchy

```
PatientRankPanel
  PatientSearchBar
    SearchInput (search by patient ID)
    StatusFilterDropdown (eligible/potentially/ineligible/needs_review)
  PatientSummaryBar
    CountBadge (eligible: green)
    CountBadge (potentially: amber)
    CountBadge (ineligible: red)
    CountBadge (needs review: blue)
  PatientList (virtualized)
    PatientRankRow (for each patient)
      RankBadge
      PatientIdLabel
      AgeBadge
      GenderIcon
      ScoreBadge
      StatusIcon
  BulkActionBar
    SelectAllCheckbox
    BulkAcceptButton
    BulkRejectButton
```

### TypeScript Interfaces

```typescript
export interface PatientSummary {
  /** Internal patient ID */
  id: string;
  /** Display ID (e.g., "PT-101") */
  displayId: string;
  /** Age in years */
  age: number;
  /** Gender: M, F, O */
  gender: 'M' | 'F' | 'O';
  /** Primary diagnosis description */
  primaryDiagnosis: string;
  /** Primary diagnosis ICD code */
  primaryDiagnosisCode: string;
  /** Eligibility score 0-100 */
  score: number;
  /** Current screening status */
  status: ScreeningStatus;
  /** Number of criteria met */
  criteriaMet: number;
  /** Total number of criteria */
  criteriaTotal: number;
  /** Number of criteria that need review */
  criteriaUnknown: number;
  /** Rank position (1-based) */
  rank: number;
}

export type ScreeningStatus =
  | 'eligible'          // All inclusion met, no exclusion triggered
  | 'potentially'       // Most criteria met, some unknown
  | 'ineligible'        // Exclusion triggered or inclusion not met
  | 'needs_review'      // Requires human review
  | 'accepted'          // Manually accepted by user
  | 'rejected'          // Manually rejected by user
  | 'deferred';         // Deferred for later review

export interface StatusFilter {
  eligible: boolean;
  potentially: boolean;
  ineligible: boolean;
  needsReview: boolean;
  accepted: boolean;
  rejected: boolean;
  deferred: boolean;
}
```

### PatientRankPanel Component

```typescript
// frontend/src/components/screening/PatientRankPanel.tsx

export function PatientRankPanel() {
  const {
    patients,
    selectedPatientId,
    selectPatient,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    scoreRange,
  } = useScreeningStore();

  // Filter and sort patients
  const filteredPatients = useMemo(() => {
    return patients
      .filter((p) => {
        // Search filter
        if (searchQuery && !p.displayId.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
        // Status filter
        if (!statusFilter[p.status]) return false;
        // Score range filter
        if (p.score < scoreRange[0] || p.score > scoreRange[1]) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score); // Sort by score descending
  }, [patients, searchQuery, statusFilter, scoreRange]);

  // Counts by status
  const counts = useMemo(() => ({
    eligible: patients.filter((p) => p.status === 'eligible').length,
    potentially: patients.filter((p) => p.status === 'potentially').length,
    ineligible: patients.filter((p) => p.status === 'ineligible').length,
    needsReview: patients.filter((p) => p.status === 'needs_review').length,
  }), [patients]);

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="p-3 border-b border-gray-200">
        <PatientSearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />
      </div>

      {/* Summary counts */}
      <PatientSummaryBar counts={counts} />

      {/* Virtualized patient list */}
      <div className="flex-1 min-h-0">
        <VirtualizedPatientList
          patients={filteredPatients}
          selectedId={selectedPatientId}
          onSelect={selectPatient}
        />
      </div>

      {/* Bulk actions */}
      <BulkActionBar patients={filteredPatients} />
    </div>
  );
}
```

### PatientSearchBar Component

```typescript
// frontend/src/components/screening/PatientSearchBar.tsx

export function PatientSearchBar({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
}: PatientSearchBarProps) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by ID..."
          className="h-8 pl-8 text-xs"
          aria-label="Search patients by ID"
        />
      </div>
    </div>
  );
}
```

### PatientSummaryBar Component

```typescript
// frontend/src/components/screening/PatientSummaryBar.tsx

interface PatientCounts {
  eligible: number;
  potentially: number;
  ineligible: number;
  needsReview: number;
}

export function PatientSummaryBar({ counts }: { counts: PatientCounts }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-200 bg-gray-50">
      <CountBadge
        count={counts.eligible}
        label="Eligible"
        className="bg-emerald-100 text-emerald-700"
      />
      <CountBadge
        count={counts.potentially}
        label="Potential"
        className="bg-amber-100 text-amber-700"
      />
      <CountBadge
        count={counts.ineligible}
        label="Ineligible"
        className="bg-red-100 text-red-700"
      />
      <CountBadge
        count={counts.needsReview}
        label="Review"
        className="bg-blue-100 text-blue-700"
      />
    </div>
  );
}

function CountBadge({
  count,
  label,
  className,
}: {
  count: number;
  label: string;
  className: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
        className,
      )}
      title={`${count} ${label}`}
    >
      <span>{count}</span>
    </div>
  );
}
```

### VirtualizedPatientList Component

```typescript
// frontend/src/components/screening/VirtualizedPatientList.tsx

import { useVirtualizer } from '@tanstack/react-virtual';

const ROW_HEIGHT = 48; // px

export function VirtualizedPatientList({
  patients,
  selectedId,
  onSelect,
}: VirtualizedPatientListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: patients.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div
      ref={parentRef}
      className="h-full overflow-auto"
      role="listbox"
      aria-label="Patient list sorted by eligibility score"
      tabIndex={0}
      onKeyDown={(e) => handleKeyboardNav(e, patients, selectedId, onSelect)}
    >
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const patient = patients[virtualRow.index];
          const isSelected = patient.id === selectedId;

          return (
            <div
              key={patient.id}
              role="option"
              aria-selected={isSelected}
              aria-label={`Patient ${patient.displayId}, score ${patient.score}, ${patient.status}`}
              className={cn(
                'absolute left-0 right-0 flex items-center gap-2 px-3 cursor-pointer',
                'border-l-2 transition-colors duration-150',
                isSelected
                  ? 'bg-blue-50 border-l-blue-500'
                  : 'bg-white border-l-transparent hover:bg-gray-50',
              )}
              style={{
                height: `${ROW_HEIGHT}px`,
                top: `${virtualRow.start}px`,
              }}
              onClick={() => onSelect(patient.id)}
            >
              <PatientRankRow patient={patient} isSelected={isSelected} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### PatientRankRow Component

```typescript
// frontend/src/components/screening/PatientRankRow.tsx

export function PatientRankRow({
  patient,
  isSelected,
}: {
  patient: PatientSummary;
  isSelected: boolean;
}) {
  return (
    <>
      {/* Rank */}
      <RankBadge rank={patient.rank} />

      {/* Patient ID */}
      <span className="text-xs font-mono font-medium text-gray-900 min-w-[56px]">
        {patient.displayId}
      </span>

      {/* Age */}
      <span className="text-xs text-gray-500 min-w-[24px] text-right">
        {patient.age}
      </span>

      {/* Gender icon */}
      <GenderIcon gender={patient.gender} className="h-3 w-3 text-gray-400" />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Score badge */}
      <ScoreBadge score={patient.score} />

      {/* Status icon */}
      <StatusIcon status={patient.status} />
    </>
  );
}
```

### RankBadge Component

```typescript
// frontend/src/components/screening/badges/RankBadge.tsx

export function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center',
        'w-5 h-5 rounded-full text-[10px] font-semibold',
        rank <= 3
          ? 'bg-blue-100 text-blue-700'
          : 'bg-gray-100 text-gray-500',
      )}
    >
      {rank}
    </span>
  );
}
```

### ScoreBadge Component

```typescript
// frontend/src/components/screening/badges/ScoreBadge.tsx

/**
 * Color-coded eligibility score badge.
 *
 * Score ranges:
 *   85-100: Green  (#10B981 / emerald-500)
 *   70-84:  Lime   (#84CC16 / lime-500)
 *   50-69:  Amber  (#F59E0B / amber-500)
 *   0-49:   Red    (#EF4444 / red-500)
 */
export function ScoreBadge({ score }: { score: number }) {
  const { bgClass, textClass } = getScoreColors(score);

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center',
        'min-w-[28px] h-5 px-1 rounded text-[10px] font-bold',
        bgClass,
        textClass,
      )}
      title={`Eligibility score: ${score}/100`}
    >
      {score}
    </span>
  );
}

function getScoreColors(score: number): { bgClass: string; textClass: string } {
  if (score >= 85) return { bgClass: 'bg-emerald-100', textClass: 'text-emerald-700' };
  if (score >= 70) return { bgClass: 'bg-lime-100', textClass: 'text-lime-700' };
  if (score >= 50) return { bgClass: 'bg-amber-100', textClass: 'text-amber-700' };
  return { bgClass: 'bg-red-100', textClass: 'text-red-700' };
}
```

### StatusIcon Component

```typescript
// frontend/src/components/screening/badges/StatusIcon.tsx

/**
 * Status icons:
 *   eligible    -> checkmark (green)
 *   potentially -> question mark (amber)
 *   ineligible  -> X (red)
 *   needs_review -> eye (blue)
 *   accepted    -> double checkmark (green)
 *   rejected    -> X circle (red)
 *   deferred    -> clock (amber)
 */
export function StatusIcon({ status }: { status: ScreeningStatus }) {
  const config = STATUS_ICON_CONFIG[status];

  return (
    <config.icon
      className={cn('h-3.5 w-3.5', config.colorClass)}
      aria-label={config.label}
    />
  );
}

const STATUS_ICON_CONFIG: Record<ScreeningStatus, {
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  label: string;
}> = {
  eligible:     { icon: Check,        colorClass: 'text-emerald-500', label: 'Eligible' },
  potentially:  { icon: HelpCircle,   colorClass: 'text-amber-500',   label: 'Potentially eligible' },
  ineligible:   { icon: X,            colorClass: 'text-red-500',     label: 'Ineligible' },
  needs_review: { icon: Eye,          colorClass: 'text-blue-500',    label: 'Needs review' },
  accepted:     { icon: CheckCheck,   colorClass: 'text-emerald-600', label: 'Accepted' },
  rejected:     { icon: XCircle,      colorClass: 'text-red-600',     label: 'Rejected' },
  deferred:     { icon: Clock,        colorClass: 'text-amber-600',   label: 'Deferred' },
};
```

### GenderIcon Component

```typescript
// frontend/src/components/screening/badges/GenderIcon.tsx

export function GenderIcon({
  gender,
  className,
}: {
  gender: 'M' | 'F' | 'O';
  className?: string;
}) {
  switch (gender) {
    case 'M':
      return <Mars className={className} aria-label="Male" />;
    case 'F':
      return <Venus className={className} aria-label="Female" />;
    case 'O':
      return <CircleDot className={className} aria-label="Other" />;
  }
}
```

### BulkActionBar Component

```typescript
// frontend/src/components/screening/BulkActionBar.tsx

export function BulkActionBar({ patients }: { patients: PatientSummary[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { bulkAccept, bulkReject } = useScreeningStore();

  const selectAll = () => {
    setSelectedIds(new Set(patients.map((p) => p.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  if (selectedIds.size === 0) {
    return (
      <div className="px-3 py-2 border-t border-gray-200 bg-gray-50">
        <Button
          variant="ghost"
          size="sm"
          onClick={selectAll}
          className="text-xs"
        >
          Select All ({patients.length})
        </Button>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-t border-gray-200 bg-blue-50 flex items-center gap-2">
      <span className="text-xs font-medium text-blue-700">
        {selectedIds.size} selected
      </span>
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        onClick={clearSelection}
        className="text-xs"
      >
        Clear
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => bulkAccept(Array.from(selectedIds))}
        className="text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50"
      >
        Accept
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => bulkReject(Array.from(selectedIds))}
        className="text-xs text-red-600 border-red-200 hover:bg-red-50"
      >
        Reject
      </Button>
    </div>
  );
}
```

---

## Middle Panel -- Patient Detail & Criteria

### Component Hierarchy

```
CriteriaDetailPanel
  EmptyState (when no patient selected)
  PatientHeaderCard
    PatientId, Age, Gender, PrimaryDiagnosis
    KeyVitals (BMI, BP if available)
    InsuranceType badge
  EligibilityScoreDisplay
    CircularProgress (large, color-coded)
    ScoreNumber
    StatusBadge
    MissingDataWarning
  CriteriaSections
    InclusionSection
      SectionHeader ("Inclusion Criteria" + met count "8/10")
      CriterionCard (for each criterion)
        CriterionNumber
        CriterionText
        ResultBadge (Met/Not Met/Unknown/Needs Review)
        ConfidenceIndicator
        EvidencePreview (collapsed, expandable)
        OverrideButton (pencil icon)
    ExclusionSection
      SectionHeader ("Exclusion Criteria" + triggered count "0/5")
      CriterionCard (same structure, inverted color logic)
  ActionBar
    AcceptButton
    RejectButton (with reason)
    DeferButton (with note)
  OverrideModal
```

### TypeScript Interfaces

```typescript
export interface ScreeningResult {
  /** Patient ID */
  patientId: string;
  /** Study ID */
  studyId: string;
  /** Overall eligibility score 0-100 */
  score: number;
  /** Computed status */
  status: ScreeningStatus;
  /** Individual criterion results */
  criteria: CriterionResult[];
  /** Timestamp of last evaluation */
  evaluatedAt: string;
  /** Whether any criteria have missing data */
  hasMissingData: boolean;
}

export interface CriterionResult {
  /** Unique criterion ID (study_id + type + number) */
  id: string;
  /** Criterion type */
  type: 'inclusion' | 'exclusion';
  /** Criterion number within its section */
  number: number;
  /** Full criterion text */
  text: string;
  /** Evaluation result */
  result: CriterionResultValue;
  /** How the result was determined */
  source: 'rule' | 'ai' | 'manual_override';
  /** AI confidence percentage (0-100), null for rule-based */
  confidence: number | null;
  /** Evidence linking to source data */
  evidence: CriterionEvidence[];
  /** Override info if manually overridden */
  override?: CriterionOverride;
}

export type CriterionResultValue =
  | 'met'
  | 'not_met'
  | 'unknown'
  | 'needs_review';

export interface CriterionEvidence {
  /** Which data tab this evidence lives in */
  dataType: 'demographics' | 'diagnoses' | 'medications' | 'labs' | 'vitals' | 'notes';
  /** ID of the specific record in the source data */
  recordId: string;
  /** Brief description of the evidence */
  summary: string;
  /** The actual value from the record */
  value: string;
}

export interface CriterionOverride {
  /** Original result before override */
  originalResult: CriterionResultValue;
  /** New result after override */
  newResult: CriterionResultValue;
  /** Reason for override (required) */
  reason: string;
  /** User who performed the override */
  overriddenBy: string;
  /** Timestamp of override */
  overriddenAt: string;
}
```

### CriteriaDetailPanel Component

```typescript
// frontend/src/components/screening/CriteriaDetailPanel.tsx

export function CriteriaDetailPanel() {
  const {
    selectedPatientId,
    screeningResults,
    criteriaResults,
    selectedCriterionId,
    selectCriterion,
  } = useScreeningStore();

  if (!selectedPatientId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Select a patient to view eligibility details</p>
        </div>
      </div>
    );
  }

  const result = screeningResults.get(selectedPatientId);
  if (!result) {
    return <LoadingState message="Loading screening results..." />;
  }

  const inclusionCriteria = result.criteria.filter((c) => c.type === 'inclusion');
  const exclusionCriteria = result.criteria.filter((c) => c.type === 'exclusion');

  const inclusionMet = inclusionCriteria.filter((c) => c.result === 'met').length;
  const exclusionTriggered = exclusionCriteria.filter((c) => c.result === 'met').length;

  return (
    <div className="h-full flex flex-col">
      {/* Patient Header */}
      <PatientHeaderCard patientId={selectedPatientId} />

      {/* Score Display */}
      <EligibilityScoreDisplay result={result} />

      {/* Criteria list (scrollable) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-6">
        {/* Inclusion Criteria */}
        <CriteriaSection
          title="Inclusion Criteria"
          count={`${inclusionMet}/${inclusionCriteria.length}`}
          criteria={inclusionCriteria}
          selectedId={selectedCriterionId}
          onSelect={selectCriterion}
          invertLogic={false}
        />

        {/* Exclusion Criteria */}
        <CriteriaSection
          title="Exclusion Criteria"
          count={`${exclusionTriggered}/${exclusionCriteria.length} triggered`}
          criteria={exclusionCriteria}
          selectedId={selectedCriterionId}
          onSelect={selectCriterion}
          invertLogic={true}
        />
      </div>

      {/* Action Bar */}
      <ActionBar patientId={selectedPatientId} />
    </div>
  );
}
```

### PatientHeaderCard Component

```typescript
// frontend/src/components/screening/PatientHeaderCard.tsx

export function PatientHeaderCard({ patientId }: { patientId: string }) {
  const patient = useScreeningStore((s) =>
    s.patients.find((p) => p.id === patientId)
  );

  if (!patient) return null;

  return (
    <div className="px-4 py-3 border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <User className="h-5 w-5 text-gray-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                {patient.displayId}
              </span>
              <GenderIcon gender={patient.gender} className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs text-gray-500">{patient.age}y</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {patient.primaryDiagnosis}
              <span className="ml-1 font-mono text-[10px] text-gray-400">
                ({patient.primaryDiagnosisCode})
              </span>
            </p>
          </div>
        </div>

        {/* Key vitals if available */}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {patient.bmi && (
            <span title="BMI">BMI {patient.bmi.toFixed(1)}</span>
          )}
          {patient.bloodPressure && (
            <span title="Blood Pressure">
              BP {patient.bloodPressure}
            </span>
          )}
          {patient.insuranceType && (
            <Badge variant="outline" className="text-[10px]">
              {patient.insuranceType}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
```

### EligibilityScoreDisplay Component

```typescript
// frontend/src/components/screening/EligibilityScoreDisplay.tsx

export function EligibilityScoreDisplay({ result }: { result: ScreeningResult }) {
  const { score, status, hasMissingData } = result;
  const { bgColor, textColor, strokeColor } = getScoreDisplayColors(score);

  return (
    <div className="px-4 py-4 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-4">
        {/* Circular progress */}
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
            {/* Background circle */}
            <circle
              cx="32" cy="32" r="28"
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="4"
            />
            {/* Progress arc */}
            <circle
              cx="32" cy="32" r="28"
              fill="none"
              stroke={strokeColor}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(score / 100) * 175.93} 175.93`}
              className="transition-all duration-500"
            />
          </svg>
          <span
            className={cn(
              'absolute inset-0 flex items-center justify-center',
              'text-lg font-bold',
              textColor,
            )}
          >
            {score}
          </span>
        </div>

        <div>
          <StatusBadge status={status} />
          {hasMissingData && (
            <div className="flex items-center gap-1 mt-1">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              <span className="text-[11px] text-amber-600">
                Some criteria have missing data
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ScreeningStatus }) {
  const config: Record<ScreeningStatus, { label: string; className: string }> = {
    eligible:     { label: 'Eligible',            className: 'bg-emerald-100 text-emerald-700' },
    potentially:  { label: 'Potentially Eligible', className: 'bg-amber-100 text-amber-700' },
    ineligible:   { label: 'Ineligible',           className: 'bg-red-100 text-red-700' },
    needs_review: { label: 'Needs Review',         className: 'bg-blue-100 text-blue-700' },
    accepted:     { label: 'Accepted',             className: 'bg-emerald-100 text-emerald-700' },
    rejected:     { label: 'Rejected',             className: 'bg-red-100 text-red-700' },
    deferred:     { label: 'Deferred',             className: 'bg-amber-100 text-amber-700' },
  };

  const { label, className } = config[status];

  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', className)}>
      {label}
    </span>
  );
}

function getScoreDisplayColors(score: number) {
  if (score >= 85) return {
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-600',
    strokeColor: '#10B981',
  };
  if (score >= 70) return {
    bgColor: 'bg-lime-50',
    textColor: 'text-lime-600',
    strokeColor: '#84CC16',
  };
  if (score >= 50) return {
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-600',
    strokeColor: '#F59E0B',
  };
  return {
    bgColor: 'bg-red-50',
    textColor: 'text-red-600',
    strokeColor: '#EF4444',
  };
}
```

### CriteriaSection Component

```typescript
// frontend/src/components/screening/CriteriaSection.tsx

interface CriteriaSectionProps {
  title: string;
  count: string;
  criteria: CriterionResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** For exclusion criteria, invert the color logic:
   *  "met" (exclusion triggered) = bad (red)
   *  "not_met" (exclusion not triggered) = good (green) */
  invertLogic: boolean;
}

export function CriteriaSection({
  title,
  count,
  criteria,
  selectedId,
  onSelect,
  invertLogic,
}: CriteriaSectionProps) {
  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
          {title}
        </h3>
        <span className="text-xs text-gray-500">{count}</span>
      </div>

      {/* Criterion cards */}
      <div className="space-y-2">
        {criteria.map((criterion) => (
          <CriterionCard
            key={criterion.id}
            criterion={criterion}
            isSelected={criterion.id === selectedId}
            onClick={() => onSelect(criterion.id)}
            invertLogic={invertLogic}
          />
        ))}
      </div>
    </div>
  );
}
```

### CriterionCard Component

```typescript
// frontend/src/components/screening/CriterionCard.tsx

const CRITERION_CARD_HEIGHT = 72; // px target

export function CriterionCard({
  criterion,
  isSelected,
  onClick,
  invertLogic,
}: CriterionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { openOverrideModal } = useScreeningStore();

  const borderColor = getBorderColor(criterion.result, invertLogic);

  return (
    <div
      className={cn(
        'relative rounded-lg border bg-white p-3 cursor-pointer',
        'transition-all duration-150',
        `border-l-4 ${borderColor}`,
        isSelected
          ? 'ring-2 ring-blue-400 ring-offset-1 shadow-sm'
          : 'hover:shadow-sm',
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Criterion ${criterion.number}: ${criterion.text}. Result: ${criterion.result}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick();
        if (e.key === ' ') { e.preventDefault(); setIsExpanded(!isExpanded); }
      }}
    >
      <div className="flex items-start gap-2">
        {/* Criterion number */}
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 flex items-center justify-center mt-0.5">
          {criterion.number}
        </span>

        {/* Text and badges */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-800 leading-relaxed">
            {criterion.text}
          </p>

          <div className="flex items-center gap-2 mt-1.5">
            {/* Result badge */}
            <ResultBadge result={criterion.result} invertLogic={invertLogic} />

            {/* Confidence indicator */}
            <ConfidenceIndicator
              source={criterion.source}
              confidence={criterion.confidence}
            />

            {/* Override indicator */}
            {criterion.override && (
              <Badge variant="outline" className="text-[10px] border-purple-200 text-purple-600">
                Overridden
              </Badge>
            )}

            {/* Missing data chip */}
            {criterion.result === 'unknown' && criterion.evidence.length === 0 && (
              <Badge variant="outline" className="text-[10px] border-orange-200 text-orange-600">
                Missing Data
              </Badge>
            )}
          </div>
        </div>

        {/* Override button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:opacity-100 focus:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            openOverrideModal(criterion.id);
          }}
          aria-label={`Override criterion ${criterion.number}`}
        >
          <Pencil className="h-3 w-3 text-gray-400" />
        </Button>
      </div>

      {/* Expandable evidence preview */}
      {isExpanded && criterion.evidence.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-[10px] font-medium text-gray-500 mb-1">Evidence:</p>
          {criterion.evidence.map((ev, i) => (
            <div key={i} className="flex items-center gap-1 text-[11px] text-gray-600 py-0.5">
              <DataTypeIcon type={ev.dataType} className="h-3 w-3" />
              <span className="font-medium">{ev.summary}:</span>
              <span className="font-mono">{ev.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getBorderColor(result: CriterionResultValue, invertLogic: boolean): string {
  // For exclusion criteria, "met" means the exclusion IS triggered (bad)
  const effectiveResult = invertLogic
    ? (result === 'met' ? 'not_met' : result === 'not_met' ? 'met' : result)
    : result;

  switch (effectiveResult) {
    case 'met':          return 'border-l-emerald-500';
    case 'not_met':      return 'border-l-red-500';
    case 'unknown':      return 'border-l-amber-500';
    case 'needs_review': return 'border-l-blue-500';
    default:             return 'border-l-gray-300';
  }
}
```

### ResultBadge Component

```typescript
// frontend/src/components/screening/badges/ResultBadge.tsx

export function ResultBadge({
  result,
  invertLogic = false,
}: {
  result: CriterionResultValue;
  invertLogic?: boolean;
}) {
  const config: Record<CriterionResultValue, { label: string; className: string }> = {
    met: invertLogic
      ? { label: 'TRIGGERED', className: 'bg-red-100 text-red-700' }
      : { label: 'MET', className: 'bg-emerald-100 text-emerald-700' },
    not_met: invertLogic
      ? { label: 'CLEAR', className: 'bg-emerald-100 text-emerald-700' }
      : { label: 'NOT MET', className: 'bg-red-100 text-red-700' },
    unknown: { label: 'UNKNOWN', className: 'bg-amber-100 text-amber-700' },
    needs_review: { label: 'REVIEW', className: 'bg-blue-100 text-blue-700' },
  };

  const { label, className } = config[result];

  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold uppercase', className)}>
      {label}
    </span>
  );
}
```

### ConfidenceIndicator Component

```typescript
// frontend/src/components/screening/badges/ConfidenceIndicator.tsx

export function ConfidenceIndicator({
  source,
  confidence,
}: {
  source: 'rule' | 'ai' | 'manual_override';
  confidence: number | null;
}) {
  if (source === 'rule') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400" title="Rule-based evaluation">
        <Check className="h-2.5 w-2.5" />
        Rule
      </span>
    );
  }

  if (source === 'ai' && confidence !== null) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px]',
          confidence >= 80
            ? 'bg-purple-50 text-purple-600'
            : 'bg-purple-50 text-purple-400',
        )}
        title={`AI evaluation with ${confidence}% confidence`}
      >
        <Brain className="h-2.5 w-2.5" />
        {confidence}%
      </span>
    );
  }

  if (source === 'manual_override') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-purple-500" title="Manually overridden">
        <UserCheck className="h-2.5 w-2.5" />
        Manual
      </span>
    );
  }

  return null;
}
```

### ActionBar Component

```typescript
// frontend/src/components/screening/ActionBar.tsx

export function ActionBar({ patientId }: { patientId: string }) {
  const { acceptPatient, rejectPatient, deferPatient } = useScreeningStore();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [deferDialogOpen, setDeferDialogOpen] = useState(false);

  return (
    <div className="px-4 py-3 border-t border-gray-200 bg-white flex items-center gap-2">
      {/* Accept */}
      <Button
        onClick={() => acceptPatient(patientId)}
        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
        size="sm"
      >
        <Check className="h-4 w-4 mr-1.5" />
        Accept
      </Button>

      {/* Reject */}
      <Button
        onClick={() => setRejectDialogOpen(true)}
        variant="outline"
        className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
        size="sm"
      >
        <X className="h-4 w-4 mr-1.5" />
        Reject
      </Button>

      {/* Defer */}
      <Button
        onClick={() => setDeferDialogOpen(true)}
        variant="outline"
        className="flex-1 text-amber-600 border-amber-200 hover:bg-amber-50"
        size="sm"
      >
        <Clock className="h-4 w-4 mr-1.5" />
        Defer
      </Button>

      {/* Reject reason dialog */}
      <RejectDialog
        open={rejectDialogOpen}
        onClose={() => setRejectDialogOpen(false)}
        onConfirm={(reason) => {
          rejectPatient(patientId, reason);
          setRejectDialogOpen(false);
        }}
      />

      {/* Defer note dialog */}
      <DeferDialog
        open={deferDialogOpen}
        onClose={() => setDeferDialogOpen(false)}
        onConfirm={(note) => {
          deferPatient(patientId, note);
          setDeferDialogOpen(false);
        }}
      />
    </div>
  );
}
```

### OverrideModal Component

```typescript
// frontend/src/components/screening/OverrideModal.tsx

export function OverrideModal() {
  const {
    isOverrideModalOpen,
    overrideCriterionId,
    closeOverrideModal,
    overrideCriterion,
  } = useScreeningStore();

  const criterion = useScreeningStore((s) => {
    if (!overrideCriterionId) return null;
    for (const [, result] of s.screeningResults) {
      const found = result.criteria.find((c) => c.id === overrideCriterionId);
      if (found) return found;
    }
    return null;
  });

  const [newResult, setNewResult] = useState<CriterionResultValue>('met');
  const [reason, setReason] = useState('');

  if (!criterion) return null;

  return (
    <Dialog open={isOverrideModalOpen} onOpenChange={closeOverrideModal}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Override Criterion Result</DialogTitle>
          <DialogDescription>
            Manually override the evaluation result for this criterion.
            A reason is required for audit purposes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Original criterion */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Criterion {criterion.number}:</p>
            <p className="text-sm text-gray-800">{criterion.text}</p>
          </div>

          {/* Current result */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Current result:</span>
            <ResultBadge result={criterion.result} />
            <ConfidenceIndicator
              source={criterion.source}
              confidence={criterion.confidence}
            />
          </div>

          {/* New result selector */}
          <div>
            <Label className="text-xs">New Result</Label>
            <Select
              value={newResult}
              onValueChange={(v) => setNewResult(v as CriterionResultValue)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="met">Met</SelectItem>
                <SelectItem value="not_met">Not Met</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reason (required) */}
          <div>
            <Label className="text-xs">
              Reason for Override <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this criterion result is being overridden..."
              rows={3}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closeOverrideModal}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              overrideCriterion(criterion.id, newResult, reason);
              closeOverrideModal();
            }}
            disabled={!reason.trim()}
          >
            Confirm Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Right Panel -- Source Data Viewer

### Component Hierarchy

```
SourceDataPanel
  EmptyState (when no patient selected)
  TabBar
    Tab: Demographics
    Tab: Diagnoses
    Tab: Medications
    Tab: Labs
    Tab: Vitals
    Tab: Notes
  TabContent
    DemographicsTab (key-value grid)
    DiagnosesTab (TanStack Table)
    MedicationsTab (TanStack Table)
    LabResultsTab (TanStack Table)
    VitalsTab (TanStack Table)
    NotesTab (expandable cards)
  ViewStudyButton
```

### TypeScript Interfaces

```typescript
export type SourceDataTab =
  | 'demographics'
  | 'diagnoses'
  | 'medications'
  | 'labs'
  | 'vitals'
  | 'notes';

export interface DiagnosisRecord {
  id: string;
  code: string;        // ICD-10 code
  description: string;
  date: string;        // ISO date
  status: 'active' | 'resolved' | 'inactive';
  type: 'primary' | 'secondary';
}

export interface MedicationRecord {
  id: string;
  drugName: string;
  dose: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
  status: 'active' | 'discontinued' | 'completed';
  prescriber: string;
}

export interface LabRecord {
  id: string;
  testName: string;
  value: number | string;
  unit: string;
  referenceRange: string;
  date: string;
  flag: 'normal' | 'high' | 'low' | 'critical' | null;
}

export interface VitalRecord {
  id: string;
  type: string;         // e.g., "Blood Pressure", "Heart Rate"
  value: string;
  unit: string;
  date: string;
}

export interface NoteRecord {
  id: string;
  type: string;          // "Progress Note", "Consultation", etc.
  author: string;
  date: string;
  content: string;       // May be lengthy
}
```

### SourceDataPanel Component

```typescript
// frontend/src/components/screening/SourceDataPanel.tsx

export function SourceDataPanel() {
  const {
    selectedPatientId,
    highlightedTab,
    highlightedRecordIds,
  } = useScreeningStore();

  // Auto-switch to highlighted tab when criterion is clicked
  const [activeTab, setActiveTab] = useState<SourceDataTab>('demographics');

  useEffect(() => {
    if (highlightedTab) {
      setActiveTab(highlightedTab as SourceDataTab);
    }
  }, [highlightedTab]);

  if (!selectedPatientId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Patient source data will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="border-b border-gray-200 bg-white">
        <TabBar
          tabs={SOURCE_DATA_TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          highlightedTab={highlightedTab}
        />
      </div>

      {/* Tab content (scrollable) */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <TabContent
          tab={activeTab}
          patientId={selectedPatientId}
          highlightedRecordIds={highlightedRecordIds}
        />
      </div>

      {/* View Study button */}
      <div className="px-3 py-2 border-t border-gray-200 bg-white">
        <ViewStudyButton />
      </div>
    </div>
  );
}

const SOURCE_DATA_TABS: { value: SourceDataTab; label: string }[] = [
  { value: 'demographics', label: 'Demo' },
  { value: 'diagnoses',    label: 'Dx' },
  { value: 'medications',  label: 'Meds' },
  { value: 'labs',         label: 'Labs' },
  { value: 'vitals',       label: 'Vitals' },
  { value: 'notes',        label: 'Notes' },
];
```

### TabBar Component

```typescript
// frontend/src/components/screening/TabBar.tsx

export function TabBar({
  tabs,
  activeTab,
  onTabChange,
  highlightedTab,
}: TabBarProps) {
  return (
    <div className="flex" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={activeTab === tab.value}
          className={cn(
            'px-3 py-2 text-xs font-medium transition-colors relative',
            activeTab === tab.value
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700',
            highlightedTab === tab.value && activeTab !== tab.value
              ? 'animate-pulse text-amber-600'
              : '',
          )}
          onClick={() => onTabChange(tab.value)}
        >
          {tab.label}
          {/* Highlight dot when evidence is in this tab */}
          {highlightedTab === tab.value && activeTab !== tab.value && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
          )}
        </button>
      ))}
    </div>
  );
}
```

### Data Table with Highlighting

```typescript
// frontend/src/components/screening/data-tables/HighlightableTable.tsx

/**
 * A TanStack Table wrapper that supports row highlighting.
 *
 * When a row's ID is in the `highlightedRecordIds` set:
 * 1. The row gets a yellow flash animation (500ms)
 * 2. It settles to a light yellow background
 * 3. The table auto-scrolls to center the first highlighted row
 */
export function HighlightableTable<T extends { id: string }>({
  data,
  columns,
  highlightedRecordIds,
}: HighlightableTableProps<T>) {
  const tableRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to first highlighted row
  useEffect(() => {
    if (highlightedRecordIds.length === 0) return;

    const firstHighlighted = tableRef.current?.querySelector(
      `[data-row-id="${highlightedRecordIds[0]}"]`
    );

    if (firstHighlighted) {
      firstHighlighted.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [highlightedRecordIds]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div ref={tableRef} className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-gray-200">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-3 py-2 text-left font-medium text-gray-500 bg-gray-50"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const isHighlighted = highlightedRecordIds.includes(row.original.id);

            return (
              <tr
                key={row.id}
                data-row-id={row.original.id}
                className={cn(
                  'border-b border-gray-100 transition-colors',
                  isHighlighted
                    ? 'animate-highlight-flash bg-yellow-50'
                    : 'hover:bg-gray-50',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 text-gray-700">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

### Highlight Flash Animation (CSS)

```css
/* Add to global CSS or Tailwind config */
@keyframes highlight-flash {
  0% { background-color: #FEF9C3; }    /* yellow-100 */
  25% { background-color: #FEF08A; }   /* yellow-200 -- peak flash */
  100% { background-color: #FEFCE8; }  /* yellow-50 -- settle */
}

.animate-highlight-flash {
  animation: highlight-flash 500ms ease-out forwards;
}
```

In `tailwind.config.ts`:

```typescript
module.exports = {
  theme: {
    extend: {
      keyframes: {
        'highlight-flash': {
          '0%': { backgroundColor: '#FEF9C3' },
          '25%': { backgroundColor: '#FEF08A' },
          '100%': { backgroundColor: '#FEFCE8' },
        },
      },
      animation: {
        'highlight-flash': 'highlight-flash 500ms ease-out forwards',
      },
    },
  },
};
```

### DiagnosesTab Example

```typescript
// frontend/src/components/screening/data-tables/DiagnosesTab.tsx

const diagnosisColumns: ColumnDef<DiagnosisRecord>[] = [
  {
    accessorKey: 'code',
    header: 'Code',
    cell: ({ row }) => (
      <span className="font-mono text-[11px] font-medium">
        {row.original.code}
      </span>
    ),
    size: 80,
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => (
      <span className="truncate max-w-[180px] block">
        {row.original.description}
      </span>
    ),
  },
  {
    accessorKey: 'date',
    header: 'Date',
    cell: ({ row }) => formatDate(row.original.date),
    size: 90,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={cn(
          'text-[10px]',
          row.original.status === 'active' ? 'text-emerald-600 border-emerald-200' : 'text-gray-400',
        )}
      >
        {row.original.status}
      </Badge>
    ),
    size: 70,
  },
];

export function DiagnosesTab({
  patientId,
  highlightedRecordIds,
}: {
  patientId: string;
  highlightedRecordIds: string[];
}) {
  const diagnoses = usePatientData(patientId, 'diagnoses');

  return (
    <HighlightableTable
      data={diagnoses}
      columns={diagnosisColumns}
      highlightedRecordIds={highlightedRecordIds}
    />
  );
}
```

### LabResultsTab Example

```typescript
// frontend/src/components/screening/data-tables/LabResultsTab.tsx

const labColumns: ColumnDef<LabRecord>[] = [
  {
    accessorKey: 'testName',
    header: 'Test',
    size: 120,
  },
  {
    accessorKey: 'value',
    header: 'Value',
    cell: ({ row }) => (
      <span className={cn(
        'font-mono',
        row.original.flag === 'high' && 'text-red-600 font-bold',
        row.original.flag === 'low' && 'text-blue-600 font-bold',
        row.original.flag === 'critical' && 'text-red-700 font-bold bg-red-50 px-1 rounded',
      )}>
        {row.original.value}
      </span>
    ),
    size: 80,
  },
  {
    accessorKey: 'unit',
    header: 'Unit',
    cell: ({ row }) => (
      <span className="text-gray-400">{row.original.unit}</span>
    ),
    size: 60,
  },
  {
    accessorKey: 'referenceRange',
    header: 'Ref Range',
    cell: ({ row }) => (
      <span className="text-gray-400 text-[10px]">{row.original.referenceRange}</span>
    ),
    size: 80,
  },
  {
    accessorKey: 'date',
    header: 'Date',
    cell: ({ row }) => formatDate(row.original.date),
    size: 90,
  },
  {
    accessorKey: 'flag',
    header: '',
    cell: ({ row }) => {
      if (!row.original.flag || row.original.flag === 'normal') return null;
      return (
        <FlagBadge flag={row.original.flag} />
      );
    },
    size: 50,
  },
];
```

### NotesTab

```typescript
// frontend/src/components/screening/data-tables/NotesTab.tsx

export function NotesTab({
  patientId,
  highlightedRecordIds,
}: {
  patientId: string;
  highlightedRecordIds: string[];
}) {
  const notes = usePatientData(patientId, 'notes');

  return (
    <div className="p-3 space-y-2">
      {notes.map((note) => {
        const isHighlighted = highlightedRecordIds.includes(note.id);

        return (
          <Collapsible key={note.id}>
            <CollapsibleTrigger asChild>
              <div
                data-row-id={note.id}
                className={cn(
                  'flex items-center justify-between p-2 rounded cursor-pointer',
                  'hover:bg-gray-50 transition-colors',
                  isHighlighted && 'animate-highlight-flash bg-yellow-50',
                )}
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs font-medium">{note.type}</span>
                  <span className="text-[10px] text-gray-400">{note.author}</span>
                </div>
                <span className="text-[10px] text-gray-400">{formatDate(note.date)}</span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-2 py-2 text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-b">
                {note.content}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
```

---

## Interactive Highlighting

This is the key UX feature that ties the three panels together. When a user
clicks a criterion in the middle panel, the right panel automatically shows
the evidence that supports the criterion evaluation.

### Highlighting Flow

```
User clicks criterion in middle panel
         |
         v
selectCriterion(id) called on Zustand store
         |
         v
Store looks up criterion's evidence[] array
         |
         v
Sets highlightedTab to evidence[0].dataType
Sets highlightedRecordIds to evidence.map(e => e.recordId)
         |
         v
Right panel: useEffect detects highlightedTab change
  -> switches active tab
         |
         v
HighlightableTable: useEffect detects highlightedRecordIds change
  -> scrollIntoView({ behavior: 'smooth', block: 'center' })
  -> applies animate-highlight-flash class
         |
         v
Yellow flash animation plays (500ms)
  -> settles to light yellow background
         |
         v
User clicks different criterion
  -> previous highlights cleared
  -> new highlights applied
```

### Store Logic

```typescript
// In useScreeningStore

selectCriterion: (id: string) => {
  set((state) => {
    // Find the criterion
    let criterion: CriterionResult | null = null;
    for (const [, result] of state.screeningResults) {
      const found = result.criteria.find((c) => c.id === id);
      if (found) { criterion = found; break; }
    }

    if (!criterion || criterion.evidence.length === 0) {
      return {
        selectedCriterionId: id,
        highlightedTab: null,
        highlightedRecordIds: [],
      };
    }

    // Determine primary tab and all evidence record IDs
    const primaryTab = criterion.evidence[0].dataType;
    const recordIds = criterion.evidence
      .filter((e) => e.dataType === primaryTab)
      .map((e) => e.recordId);

    return {
      selectedCriterionId: id,
      highlightedTab: primaryTab,
      highlightedRecordIds: recordIds,
    };
  });
},

clearHighlights: () => {
  set({
    selectedCriterionId: null,
    highlightedTab: null,
    highlightedRecordIds: [],
  });
},
```

---

## Study Detail Slide-Out

```typescript
// frontend/src/components/screening/StudyDetailSlideOut.tsx

export function StudyDetailSlideOut() {
  const { isStudyDetailOpen, selectedStudyId } = useScreeningStore();

  return (
    <Sheet open={isStudyDetailOpen} onOpenChange={(open) => {
      if (!open) useScreeningStore.getState().closeStudyDetail();
    }}>
      <SheetContent side="right" className="w-[400px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Study Details</SheetTitle>
        </SheetHeader>

        {selectedStudyId && <StudyDetailContent studyId={selectedStudyId} />}
      </SheetContent>
    </Sheet>
  );
}

function StudyDetailContent({ studyId }: { studyId: string }) {
  const study = useStudy(studyId);
  if (!study) return <LoadingState />;

  return (
    <div className="space-y-6 py-4">
      {/* Title */}
      <div>
        <h2 className="text-sm font-semibold">{study.title}</h2>
        <p className="text-xs text-muted-foreground mt-1 font-mono">
          {study.nctNumber}
        </p>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <MetadataItem label="Sponsor" value={study.sponsorName} />
        <MetadataItem label="Phase" value={study.phase} />
        <MetadataItem label="Status" value={study.status} />
        <MetadataItem label="Enrollment" value={study.enrollmentCount.toString()} />
      </div>

      {/* Summary */}
      <div>
        <h3 className="text-xs font-semibold mb-1">Summary</h3>
        <p className="text-xs text-gray-600 leading-relaxed">{study.summary}</p>
      </div>

      {/* Criteria */}
      <div>
        <h3 className="text-xs font-semibold mb-2">Eligibility Criteria</h3>
        <StudyCriteriaList studyId={studyId} />
      </div>

      {/* Financial card */}
      {study.financialOpportunity && (
        <Card className="p-3">
          <h3 className="text-xs font-semibold mb-2">Financial Opportunity</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <MetadataItem
              label="Per Patient"
              value={formatCents(study.financialOpportunity.estimatedPerPatientCents)}
            />
            <MetadataItem
              label="Projected Revenue"
              value={formatCents(study.financialOpportunity.projectedRevenueCents)}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
```

---

## State Management (Zustand)

### Full Store Definition

```typescript
// frontend/src/stores/screening-store.ts

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface ScreeningStore {
  // ─── Selection State ───────────────────────────────────
  selectedPatientId: string | null;
  selectedStudyId: string | null;
  selectedCriterionId: string | null;

  // ─── Data ──────────────────────────────────────────────
  patients: PatientSummary[];
  screeningResults: Map<string, ScreeningResult>;

  // ─── Filters ───────────────────────────────────────────
  statusFilter: StatusFilter;
  scoreRange: [number, number];
  searchQuery: string;

  // ─── Highlighting ──────────────────────────────────────
  highlightedTab: string | null;
  highlightedRecordIds: string[];

  // ─── UI State ──────────────────────────────────────────
  isStudyDetailOpen: boolean;
  isOverrideModalOpen: boolean;
  overrideCriterionId: string | null;

  // ─── Actions ───────────────────────────────────────────
  /** Select a patient; loads their screening results */
  selectPatient: (id: string) => void;
  /** Select a study to screen against */
  selectStudy: (id: string) => void;
  /** Select a criterion; triggers highlighting in right panel */
  selectCriterion: (id: string) => void;
  /** Accept a patient for the selected study */
  acceptPatient: (id: string) => Promise<void>;
  /** Reject a patient with a required reason */
  rejectPatient: (id: string, reason: string) => Promise<void>;
  /** Defer a patient with a required note */
  deferPatient: (id: string, note: string) => Promise<void>;
  /** Bulk accept multiple patients */
  bulkAccept: (ids: string[]) => Promise<void>;
  /** Bulk reject multiple patients */
  bulkReject: (ids: string[]) => Promise<void>;
  /** Override a criterion evaluation result */
  overrideCriterion: (
    criterionId: string,
    newResult: CriterionResultValue,
    reason: string,
  ) => Promise<void>;
  /** Update filters */
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: StatusFilter) => void;
  setScoreRange: (range: [number, number]) => void;
  /** Clear all highlights */
  clearHighlights: () => void;
  /** Open the override modal for a criterion */
  openOverrideModal: (criterionId: string) => void;
  /** Close the override modal */
  closeOverrideModal: () => void;
  /** Open the study detail slide-out */
  openStudyDetail: () => void;
  /** Close the study detail slide-out */
  closeStudyDetail: () => void;
}

export const useScreeningStore = create<ScreeningStore>()(
  immer((set, get) => ({
    // Initial state
    selectedPatientId: null,
    selectedStudyId: null,
    selectedCriterionId: null,
    patients: [],
    screeningResults: new Map(),
    statusFilter: {
      eligible: true,
      potentially: true,
      ineligible: true,
      needsReview: true,
      accepted: false,
      rejected: false,
      deferred: false,
    },
    scoreRange: [0, 100],
    searchQuery: '',
    highlightedTab: null,
    highlightedRecordIds: [],
    isStudyDetailOpen: false,
    isOverrideModalOpen: false,
    overrideCriterionId: null,

    // Actions
    selectPatient: (id) => {
      set((state) => {
        state.selectedPatientId = id;
        state.selectedCriterionId = null;
        state.highlightedTab = null;
        state.highlightedRecordIds = [];
      });

      // Auto-select first criterion
      const result = get().screeningResults.get(id);
      if (result && result.criteria.length > 0) {
        get().selectCriterion(result.criteria[0].id);
      }
    },

    selectStudy: (id) => {
      set((state) => {
        state.selectedStudyId = id;
        state.selectedPatientId = null;
        state.selectedCriterionId = null;
        state.highlightedTab = null;
        state.highlightedRecordIds = [];
      });
    },

    selectCriterion: (id) => {
      set((state) => {
        state.selectedCriterionId = id;

        // Find the criterion and its evidence
        let criterion: CriterionResult | null = null;
        for (const [, result] of state.screeningResults) {
          const found = result.criteria.find((c) => c.id === id);
          if (found) { criterion = found; break; }
        }

        if (criterion && criterion.evidence.length > 0) {
          state.highlightedTab = criterion.evidence[0].dataType;
          state.highlightedRecordIds = criterion.evidence.map((e) => e.recordId);
        } else {
          state.highlightedTab = null;
          state.highlightedRecordIds = [];
        }
      });
    },

    acceptPatient: async (id) => {
      await invoke('accept_patient', { patientId: id, studyId: get().selectedStudyId });
      set((state) => {
        const patient = state.patients.find((p) => p.id === id);
        if (patient) patient.status = 'accepted';
      });
      // Auto-advance to next patient
      autoAdvanceToNextPatient(get, set);
    },

    rejectPatient: async (id, reason) => {
      await invoke('reject_patient', { patientId: id, studyId: get().selectedStudyId, reason });
      set((state) => {
        const patient = state.patients.find((p) => p.id === id);
        if (patient) patient.status = 'rejected';
      });
      autoAdvanceToNextPatient(get, set);
    },

    deferPatient: async (id, note) => {
      await invoke('defer_patient', { patientId: id, studyId: get().selectedStudyId, note });
      set((state) => {
        const patient = state.patients.find((p) => p.id === id);
        if (patient) patient.status = 'deferred';
      });
      autoAdvanceToNextPatient(get, set);
    },

    bulkAccept: async (ids) => {
      await invoke('bulk_accept_patients', { patientIds: ids, studyId: get().selectedStudyId });
      set((state) => {
        ids.forEach((id) => {
          const patient = state.patients.find((p) => p.id === id);
          if (patient) patient.status = 'accepted';
        });
      });
    },

    bulkReject: async (ids) => {
      await invoke('bulk_reject_patients', { patientIds: ids, studyId: get().selectedStudyId });
      set((state) => {
        ids.forEach((id) => {
          const patient = state.patients.find((p) => p.id === id);
          if (patient) patient.status = 'rejected';
        });
      });
    },

    overrideCriterion: async (criterionId, newResult, reason) => {
      await invoke('override_criterion', { criterionId, newResult, reason });
      set((state) => {
        for (const [, result] of state.screeningResults) {
          const criterion = result.criteria.find((c) => c.id === criterionId);
          if (criterion) {
            criterion.override = {
              originalResult: criterion.result,
              newResult,
              reason,
              overriddenBy: 'current_user', // populated from auth
              overriddenAt: new Date().toISOString(),
            };
            criterion.result = newResult;
            criterion.source = 'manual_override';
            break;
          }
        }
      });
    },

    setSearchQuery: (query) => set({ searchQuery: query }),
    setStatusFilter: (filter) => set({ statusFilter: filter }),
    setScoreRange: (range) => set({ scoreRange: range }),
    clearHighlights: () => set({ selectedCriterionId: null, highlightedTab: null, highlightedRecordIds: [] }),
    openOverrideModal: (id) => set({ isOverrideModalOpen: true, overrideCriterionId: id }),
    closeOverrideModal: () => set({ isOverrideModalOpen: false, overrideCriterionId: null }),
    openStudyDetail: () => set({ isStudyDetailOpen: true }),
    closeStudyDetail: () => set({ isStudyDetailOpen: false }),
  }))
);

/** After accepting/rejecting/deferring, auto-select the next unreviewed patient. */
function autoAdvanceToNextPatient(
  get: () => ScreeningStore,
  set: (fn: (state: ScreeningStore) => void) => void,
) {
  const state = get();
  const currentIdx = state.patients.findIndex((p) => p.id === state.selectedPatientId);
  const nextPatient = state.patients.slice(currentIdx + 1).find(
    (p) => !['accepted', 'rejected', 'deferred'].includes(p.status)
  );

  if (nextPatient) {
    get().selectPatient(nextPatient.id);
  }
}
```

---

## Interaction Patterns

### 1. Patient Selection Flow

```
Click patient in left panel
  -> selectPatient(id) called
  -> Middle panel loads criteria for that patient
  -> Right panel loads source data for that patient
  -> First inclusion criterion auto-selected
  -> Right panel highlights evidence for first criterion
```

### 2. Criterion Click Flow

```
Click criterion card in middle panel
  -> selectCriterion(id) called
  -> Zustand store reads evidence[] array
  -> highlightedTab set to evidence[0].dataType
  -> highlightedRecordIds set to matching record IDs
  -> Right panel auto-switches to correct tab
  -> Table scrolls to first highlighted row
  -> Yellow flash animation plays on highlighted rows
```

### 3. Override Flow

```
Click pencil icon on criterion card
  -> openOverrideModal(criterionId) called
  -> OverrideModal opens showing original result
  -> User selects new result (met/not_met/unknown)
  -> User enters reason (required, textarea)
  -> Click "Confirm Override"
  -> overrideCriterion() writes to database + audit log
  -> Criterion card updates with new result + "Overridden" badge
  -> Score recalculates
```

### 4. Accept Flow

```
Click "Accept" button in action bar
  -> Confirmation toast appears
  -> Patient status changes to "accepted" in left panel
  -> Left panel auto-selects next unreviewed patient
  -> Middle panel loads new patient's criteria
  -> Smooth transition between patients
```

### 5. Keyboard Flow

```
Focus on patient list (left panel)
  -> Up/Down arrows: navigate patients
  -> Enter: select highlighted patient
  -> Tab: move focus to criteria panel
  -> Up/Down: navigate criterion cards
  -> Enter: expand/collapse evidence
  -> Space: toggle criterion evidence
  -> Escape: collapse expanded evidence
  -> Shift+A: accept current patient
  -> Shift+R: open reject dialog
  -> Shift+D: open defer dialog
```

---

## Keyboard Navigation

```typescript
// frontend/src/hooks/useScreeningKeyboard.ts

export function useScreeningKeyboard() {
  const {
    patients,
    selectedPatientId,
    selectPatient,
    selectedCriterionId,
    selectCriterion,
    acceptPatient,
  } = useScreeningStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Patient list navigation
      if (e.target instanceof HTMLElement &&
          e.target.closest('[role="listbox"]')) {
        const currentIdx = patients.findIndex((p) => p.id === selectedPatientId);

        if (e.key === 'ArrowDown' && currentIdx < patients.length - 1) {
          e.preventDefault();
          selectPatient(patients[currentIdx + 1].id);
        }
        if (e.key === 'ArrowUp' && currentIdx > 0) {
          e.preventDefault();
          selectPatient(patients[currentIdx - 1].id);
        }
      }

      // Global shortcuts
      if (e.shiftKey && e.key === 'A' && selectedPatientId) {
        e.preventDefault();
        acceptPatient(selectedPatientId);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [patients, selectedPatientId, selectedCriterionId]);
}
```

---

## Design System

### Color Palette

| Token              | Value     | Usage                                    |
| ------------------ | --------- | ---------------------------------------- |
| Background         | `#FAFAFA` | Page/app background                      |
| Panel Border       | `#E5E7EB` | gray-200, dividers between panels        |
| Active/Selected BG | `#EFF6FF` | blue-50, selected patient row            |
| Active Border      | `#3B82F6` | blue-500, left border on active row      |
| Met                | `#10B981` | emerald-500, met criteria                |
| Not Met            | `#EF4444` | red-500, unmet criteria                  |
| Unknown            | `#F59E0B` | amber-500, unknown criteria              |
| Needs Review       | `#3B82F6` | blue-500, review-needed criteria         |
| AI Badge           | `#A855F7` | purple-500, AI confidence indicator      |
| Highlight Flash    | `#FEF08A` | yellow-200, evidence row flash           |
| Highlight Settle   | `#FEFCE8` | yellow-50, evidence row resting state    |

### Typography

| Element            | Size   | Weight   | Color                |
| ------------------ | ------ | -------- | -------------------- |
| Panel title        | 14px   | semibold | gray-900             |
| Patient ID         | 12px   | medium   | gray-900, font-mono  |
| Criterion text     | 12px   | normal   | gray-800             |
| Badge text         | 10px   | bold     | varies               |
| Table header       | 11px   | medium   | gray-500             |
| Table cell         | 12px   | normal   | gray-700             |
| Metadata label     | 10px   | medium   | gray-500             |

### Spacing & Sizing

| Element            | Value  | Notes                     |
| ------------------ | ------ | ------------------------- |
| Patient row height | 48px   | Compact for density       |
| Criterion card     | ~72px  | Flexible based on content |
| Panel padding      | 12-16px| px-3 or px-4              |
| Card border-radius | 8px    | rounded-lg                |
| Badge border-radius| 4px    | rounded-md                |
| Card shadow        | shadow-sm | Subtle depth           |
| Modal shadow       | shadow-md | More prominent         |

### Transitions

| Property      | Duration | Easing          | Usage                        |
| ------------- | -------- | --------------- | ---------------------------- |
| Background    | 150ms    | ease-in-out     | Hover states, selection      |
| Highlight     | 500ms    | ease-out        | Evidence row flash           |
| Panel resize  | 0ms      | none            | Immediate (no lag)           |
| Slide-out     | 200ms    | ease-in-out     | Study detail sheet           |
| Accordion     | 200ms    | ease-in-out     | Evidence expand/collapse     |

---

## Accessibility

### ARIA Roles and Labels

```typescript
// Patient list
<div role="listbox" aria-label="Patient list sorted by eligibility score">
  <div role="option" aria-selected={isSelected}
       aria-label={`Patient ${displayId}, score ${score}, ${status}`}>
```

```typescript
// Criterion card
<div role="button" tabIndex={0}
     aria-label={`Criterion ${number}: ${text}. Result: ${result}`}>
```

```typescript
// Tab bar
<div role="tablist">
  <button role="tab" aria-selected={isActive}>{label}</button>
</div>
<div role="tabpanel" aria-labelledby={tabId}>
```

### Focus Management

- Focus ring: `ring-2 ring-blue-400 ring-offset-1` (visible on keyboard navigation)
- When patient is accepted/rejected, focus moves to next patient row
- Modal trap: focus trapped inside OverrideModal when open
- Escape key closes modals and slide-outs

### Screen Reader Announcements

```typescript
// Use aria-live regions for dynamic updates
<div aria-live="polite" className="sr-only">
  {/* Announced when patient is selected */}
  Patient {displayId} selected. Score: {score} out of 100. Status: {status}.
  {criteriaMet} of {criteriaTotal} criteria met.
</div>

<div aria-live="assertive" className="sr-only">
  {/* Announced on accept/reject */}
  Patient {displayId} has been {action}.
</div>
```

### High Contrast Mode

```typescript
// Detect prefers-contrast
@media (prefers-contrast: high) {
  .border-l-emerald-500 { border-left-color: #047857; border-left-width: 4px; }
  .border-l-red-500     { border-left-color: #B91C1C; border-left-width: 4px; }
  .border-l-amber-500   { border-left-color: #B45309; border-left-width: 4px; }
  .border-l-blue-500    { border-left-color: #1D4ED8; border-left-width: 4px; }

  .bg-emerald-100 { background-color: #047857; color: white; }
  .bg-red-100     { background-color: #B91C1C; color: white; }
  .bg-amber-100   { background-color: #B45309; color: white; }
  .bg-blue-100    { background-color: #1D4ED8; color: white; }
}
```

---

## Performance

### Virtualization

- Patient list: TanStack Virtual with `overscan: 10`
- Data tables: TanStack Table with pagination (50 rows per page) for large datasets
- Notes: lazy-load content on expand

### Memoization

```typescript
// Memoize expensive filtering/sorting
const filteredPatients = useMemo(() => {
  return patients
    .filter(matchesFilters)
    .sort((a, b) => b.score - a.score);
}, [patients, searchQuery, statusFilter, scoreRange]);

// Memoize criterion sections to avoid re-renders
const inclusionCriteria = useMemo(() =>
  result.criteria.filter((c) => c.type === 'inclusion'),
  [result.criteria]
);
```

### Debouncing

- Search input: 300ms debounce
- Panel resize: no debounce (immediate)
- Score range slider: 100ms debounce

### Lazy Loading

- Source data tabs: load data only when tab is first activated
- Notes content: load full text only when expanded
- Study detail: load on slide-out open

---

## Component Reference

### File Structure

```
frontend/src/components/screening/
  ScreeningLayout.tsx          -- Root layout with three panels
  ScreeningTopBar.tsx          -- Top bar with study selector
  PatientRankPanel.tsx         -- Left panel container
  PatientSearchBar.tsx         -- Search input + filter dropdown
  PatientSummaryBar.tsx        -- Status count badges
  VirtualizedPatientList.tsx   -- Virtualized patient list
  PatientRankRow.tsx           -- Individual patient row
  BulkActionBar.tsx            -- Multi-select actions
  CriteriaDetailPanel.tsx      -- Middle panel container
  PatientHeaderCard.tsx        -- Patient demographics header
  EligibilityScoreDisplay.tsx  -- Circular score + status
  CriteriaSection.tsx          -- Section wrapper (inclusion/exclusion)
  CriterionCard.tsx            -- Individual criterion with result
  ActionBar.tsx                -- Accept/Reject/Defer buttons
  OverrideModal.tsx            -- Criterion override dialog
  SourceDataPanel.tsx          -- Right panel container
  TabBar.tsx                   -- Data type tab switcher
  StudyDetailSlideOut.tsx      -- Study info sheet
  badges/
    RankBadge.tsx
    ScoreBadge.tsx
    StatusIcon.tsx
    GenderIcon.tsx
    ResultBadge.tsx
    ConfidenceIndicator.tsx
    FlagBadge.tsx
  data-tables/
    HighlightableTable.tsx     -- Base table with highlight support
    DemographicsTab.tsx
    DiagnosesTab.tsx
    MedicationsTab.tsx
    LabResultsTab.tsx
    VitalsTab.tsx
    NotesTab.tsx
```

---

## Testing

### Unit Tests

```typescript
describe('ScoreBadge', () => {
  it('renders green for scores >= 85', () => {
    render(<ScoreBadge score={92} />);
    expect(screen.getByText('92')).toHaveClass('text-emerald-700');
  });

  it('renders red for scores < 50', () => {
    render(<ScoreBadge score={23} />);
    expect(screen.getByText('23')).toHaveClass('text-red-700');
  });
});

describe('ResultBadge', () => {
  it('shows "MET" for inclusion criteria', () => {
    render(<ResultBadge result="met" invertLogic={false} />);
    expect(screen.getByText('MET')).toBeInTheDocument();
  });

  it('shows "TRIGGERED" for met exclusion criteria', () => {
    render(<ResultBadge result="met" invertLogic={true} />);
    expect(screen.getByText('TRIGGERED')).toBeInTheDocument();
  });
});

describe('CriterionCard', () => {
  it('shows AI confidence badge for AI-evaluated criteria', () => {
    render(<CriterionCard criterion={aiCriterion} isSelected={false} onClick={() => {}} invertLogic={false} />);
    expect(screen.getByText('87%')).toBeInTheDocument();
  });

  it('shows override badge when overridden', () => {
    render(<CriterionCard criterion={overriddenCriterion} isSelected={false} onClick={() => {}} invertLogic={false} />);
    expect(screen.getByText('Overridden')).toBeInTheDocument();
  });
});
```

### Integration Tests

```typescript
describe('Three-Panel Interaction', () => {
  it('highlights evidence when criterion is clicked', async () => {
    render(<ScreeningLayout />);

    // Select a patient
    await userEvent.click(screen.getByText('PT-101'));

    // Click a criterion
    await userEvent.click(screen.getByText('Age >= 18 years'));

    // Verify right panel switched to demographics tab
    expect(screen.getByRole('tab', { name: 'Demo' })).toHaveAttribute('aria-selected', 'true');

    // Verify the evidence row is highlighted
    const row = screen.getByTestId('row-demo-age');
    expect(row).toHaveClass('animate-highlight-flash');
  });

  it('auto-advances to next patient after accept', async () => {
    render(<ScreeningLayout />);

    await userEvent.click(screen.getByText('PT-101'));
    await userEvent.click(screen.getByRole('button', { name: /accept/i }));

    // Next patient should be selected
    expect(useScreeningStore.getState().selectedPatientId).toBe('pt-203');
  });
});
```

### Accessibility Tests

```typescript
describe('Accessibility', () => {
  it('patient list has correct ARIA roles', () => {
    render(<VirtualizedPatientList patients={mockPatients} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(mockPatients.length);
  });

  it('supports keyboard navigation', async () => {
    render(<ScreeningLayout />);
    const list = screen.getByRole('listbox');
    list.focus();

    await userEvent.keyboard('{ArrowDown}');
    expect(useScreeningStore.getState().selectedPatientId).toBe(mockPatients[0].id);

    await userEvent.keyboard('{ArrowDown}');
    expect(useScreeningStore.getState().selectedPatientId).toBe(mockPatients[1].id);
  });

  it('announces patient selection to screen readers', async () => {
    render(<ScreeningLayout />);
    await userEvent.click(screen.getByText('PT-101'));
    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toHaveTextContent(/PT-101/);
  });
});
```

---

## Checklist

Before modifying the three-panel screening interface:

- [ ] Layout uses react-resizable-panels with autoSaveId for persistence
- [ ] Patient list is virtualized (TanStack Virtual or react-window)
- [ ] Score badges use correct color thresholds (85/70/50)
- [ ] Exclusion criteria use inverted color logic (met = bad)
- [ ] Criterion click triggers tab switch + scroll + highlight in right panel
- [ ] Highlight flash animation plays for 500ms, settles to yellow-50
- [ ] Override modal requires reason text before confirming
- [ ] Accept/Reject auto-advances to next unreviewed patient
- [ ] All interactive elements have ARIA labels
- [ ] Keyboard navigation works: arrows, Enter, Tab, Escape
- [ ] Focus ring visible on all focusable elements
- [ ] Screen reader announcements for patient selection and actions
- [ ] High contrast mode increases border and badge contrast
- [ ] Panel backgrounds use #FAFAFA, not pure white
- [ ] Transitions use specified durations (150ms hover, 500ms highlight)
- [ ] No unnecessary re-renders (memoize filtered lists, criteria sections)
