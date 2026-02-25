# Investigation Platform - Restored Files

This archive contains all the restored and modified files for the investigation platform.

## Files Structure

```
src/
├── app/
│   └── page.tsx                          # Main app entry with routing
├── types/
│   └── api.ts                            # Type definitions
├── store/
│   ├── settings.ts                       # App and settings state
│   └── saved-searches.ts                 # Saved searches persistence
├── lib/
│   └── api-client.ts                     # API client for backend
├── hooks/
│   └── useApi.ts                         # React Query hooks
└── components/
    ├── layout/
    │   ├── main-layout.tsx               # Main layout wrapper
    │   ├── sidebar.tsx                   # Navigation sidebar
    │   └── header.tsx                    # Top header with status
    ├── dashboard/
    │   ├── dashboard-view.tsx            # Dashboard main view
    │   ├── health-card.tsx               # Health status card
    │   ├── cdc-card.tsx                  # CDC status card
    │   ├── stats-card.tsx                # Database stats card
    │   ├── charts.tsx                    # Charts components
    │   └── recent-jobs-card.tsx          # Recent pipeline jobs
    ├── tables/
    │   ├── tables-view.tsx               # Tables browser view
    │   ├── table-list.tsx                # Table list sidebar
    │   ├── schema-viewer.tsx             # Schema viewer
    │   └── records-table.tsx             # Records table
    ├── search/
    │   ├── search-view.tsx               # Quick search view
    │   ├── search-bar.tsx                # Search input component
    │   ├── search-results.tsx            # Search results display
    │   ├── unified-search-view.tsx       # AI Agent search
    │   └── robust-search-view.tsx        # Robust search with V2
    ├── settings/
    │   ├── settings-view.tsx             # Settings page
    │   └── settings-sheet.tsx            # Quick settings sheet
    ├── pipeline/
    │   └── pipeline-view.tsx             # Pipeline jobs view
    └── investigation/
        └── investigation-view.tsx        # Investigation view
```

## Features Restored

1. **Dashboard** - Overview with health, CDC, stats, charts
2. **Database Tables** - Browse tables, schemas, records
3. **Quick Search** - Simple database search
4. **AI Agent Search** - Smart search with ranking
5. **Robust Agent Search** - Full pagination + correlation + V2 toggle
6. **Investigation** - Advanced investigation tools
7. **Pipeline Jobs** - Manage data processing jobs
8. **Settings** - API configuration

## V2 Features

The Robust Search and Investigation views include V2 enhancements:
- Hybrid NER (Named Entity Recognition)
- Knowledge Graph construction
- Pattern Detection
- Risk Analysis
- Semantic Query Parsing

## Installation

Copy these files to your existing project maintaining the directory structure.
