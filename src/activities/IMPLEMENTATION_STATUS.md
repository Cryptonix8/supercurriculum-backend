# Activity Generation Implementation Status

## ✅ Currently Implemented

### PDF-First Behavior
- ✅ PDFs are treated as PRIMARY source of truth
- ✅ Year PDFs provide structure/template
- ✅ Curriculum PDFs (Primary/Secondary) provide content/material
- ✅ System fails fast if curriculum PDF is missing
- ✅ Prompt enforces PDF-first policy
- ✅ No "general knowledge" fallback
- ✅ Uses current Year PDF chunk (not just first chunk) for structure

### Manual Updates
- ✅ Re-uploading PDFs updates existing activities automatically
- ✅ System detects duplicates and updates them with new PDF content
- ✅ Supports manual refresh by re-running the endpoint

## ⚠️ Partially Implemented (Prompt Only, Not Actually Working)

### Web-Secondary Source
- ⚠️ **Status**: Mentioned in prompt, but NOT actually implemented
- ⚠️ **Current**: 
  - AI prompt allows web usage IF WEB_CONTEXT is provided
  - `webContext` is always empty (hardcoded to `''`)
  - No web search API integration exists
  - No actual web search is performed
- ⚠️ **Risk**: AI may hallucinate "web sources" if it ignores the "only if WEB_CONTEXT provided" rule
- ⚠️ **Fix Needed**: 
  - Implement web search API (Google Search, SerpAPI, etc.)
  - Call web search when PDFs are incomplete/outdated
  - Pass real web results as WEB_CONTEXT to AI
  - Only enable web when WEB_CONTEXT is actually provided

### Automated Updates
- ⚠️ **Status**: NOT implemented - only manual re-runs work
- ⚠️ **Current**: Updates happen only when admin manually re-uploads PDFs
- ⚠️ **Fix Needed**:
  - Add scheduled job (cron/queue) for periodic refresh
  - Check for PDF file changes (modification date)
  - Check for curriculum updates (web monitoring or manual trigger)
  - Automatically regenerate affected activities
  - Log changes and versioning

## 📋 Code Changes Needed

### 1. Web Search Implementation

**File**: `backend/src/activities/activity-pdf-parser.service.ts`

**Current Code** (line ~151):
```typescript
const webContext = ''; // Empty by default - no web search implemented yet
```

**Needs**:
```typescript
// Detect if PDFs are incomplete/outdated
const needsWebEnrichment = this.detectIncompleteContent(curriculumPdfText, chunk);
const webContext = needsWebEnrichment 
  ? await this.searchWebForEnrichment(topic, yearNumber)
  : '';
```

**Add Method**:
```typescript
private async searchWebForEnrichment(topic: string, yearNumber: number): Promise<string> {
  // Implement actual web search
  // Example: Use SerpAPI, Google Custom Search, or similar
  const searchResults = await this.webSearchService.search(topic);
  return this.formatWebContext(searchResults);
}
```

### 2. Automated Updates Implementation

**New File**: `backend/src/activities/activity-scheduler.service.ts`

**Option A - Cron Job**:
```typescript
@Injectable()
export class ActivitySchedulerService {
  @Cron('0 2 * * 0') // Weekly on Sunday at 2 AM
  async scheduledActivityRefresh() {
    // Check for PDF changes
    // Regenerate activities for changed PDFs
    // Log updates
  }
}
```

**Option B - Queue-Based**:
```typescript
@OnQueue('activity-refresh')
async processActivityRefresh(job: Job) {
  // Process PDF updates
  // Regenerate activities
}
```

## 🎯 Current Behavior Summary

- **PDF-First**: ✅ Fully implemented and enforced
- **Web-Secondary**: ⚠️ Prompt allows it IF WEB_CONTEXT provided, but WEB_CONTEXT is always empty (no actual web search)
- **Automated Updates**: ⚠️ Only manual re-runs work (no scheduled automation)

## ⚠️ Important Notes

1. **Web Sources**: Currently, `webContext` is hardcoded to empty string. The prompt tells AI "only use web if WEB_CONTEXT provided", but since it's always empty, web should not be used. However, AI may still hallucinate web links if it doesn't follow the rule strictly.

2. **Automation**: The system supports "automated updates" in the sense that re-uploading PDFs automatically updates activities, but there's no scheduled/triggered automation yet.

3. **Recommendation**: 
   - For now: System works as PDF-only (which is correct)
   - For production: Either remove web mention until implemented, OR implement web search before production use
   - For automation: Add scheduled job for true automated updates
