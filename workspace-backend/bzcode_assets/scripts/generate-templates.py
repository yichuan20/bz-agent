#!/usr/bin/env python3
"""
generate-templates.py — create all worker document templates and the search index.

Run once from the project root:
  python3 bzcode/scripts/generate-templates.py
"""

from __future__ import annotations
import json
from pathlib import Path

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
TEMPLATES_DIR.mkdir(exist_ok=True)

# ── Template content ───────────────────────────────────────────────────────────
TEMPLATES: list[dict] = [
    # ═══════════════════════════════════════════════════════════════════════════════
    # ALREADY EXIST — kept in index only (content already on disk)
    # ═══════════════════════════════════════════════════════════════════════════════
    {
        "id": "report",
        "title": "Report",
        "profiles": ["business-analyst", "researcher", "operations", "hr"],
        "keywords": ["report", "analysis", "findings", "research", "study", "summary", "review", "audit"],
        "use_cases": ["Write a market analysis", "Create a findings report", "Draft a research summary"],
        "existing": True,
    },
    {
        "id": "meeting-minutes",
        "title": "Meeting Minutes",
        "profiles": ["project-manager", "business-analyst", "hr", "operations"],
        "keywords": ["meeting", "minutes", "notes", "mom", "recap", "action items", "attendees"],
        "use_cases": ["Write meeting notes", "Record action items from a call", "Summarise a workshop"],
        "existing": True,
    },
    {
        "id": "proposal",
        "title": "Proposal",
        "profiles": ["sales", "business-analyst", "startup", "researcher"],
        "keywords": ["proposal", "pitch", "offer", "bid", "scope", "quote", "rfp"],
        "use_cases": ["Write a project proposal", "Draft a business proposal", "Respond to an RFP"],
        "existing": True,
    },
    {
        "id": "invoice",
        "title": "Invoice",
        "profiles": ["finance", "sales", "startup"],
        "keywords": ["invoice", "bill", "payment", "charge", "receipt", "billing"],
        "use_cases": ["Create an invoice", "Bill a client", "Request payment"],
        "existing": True,
    },
    {
        "id": "contract",
        "title": "Contract / Agreement",
        "profiles": ["legal", "sales", "hr", "startup"],
        "keywords": ["contract", "agreement", "terms", "legal", "sign", "nda", "mou"],
        "use_cases": ["Draft a service agreement", "Write a contractor contract", "Create an MOU"],
        "existing": True,
    },
    {
        "id": "brief",
        "title": "Brief",
        "profiles": ["marketing", "project-manager", "business-analyst"],
        "keywords": ["brief", "spec", "creative brief", "project brief", "scope", "requirements"],
        "use_cases": ["Write a creative brief", "Draft a project brief", "Create a design spec"],
        "existing": True,
    },
    {
        "id": "weekly-update",
        "title": "Weekly Update / Status Report",
        "profiles": ["project-manager", "operations", "startup", "hr"],
        "keywords": ["weekly", "update", "status", "progress", "standup", "report", "team"],
        "use_cases": ["Write a weekly status update", "Send a team progress report", "Create a standup summary"],
        "existing": True,
    },
    # ═══════════════════════════════════════════════════════════════════════════════
    # BUSINESS ANALYST
    # ═══════════════════════════════════════════════════════════════════════════════
    {
        "id": "business-case",
        "title": "Business Case",
        "profiles": ["business-analyst", "startup", "project-manager"],
        "keywords": ["business case", "justification", "roi", "cost benefit", "investment", "approval"],
        "use_cases": [
            "Build a business case for a new system",
            "Justify a budget request",
            "Make the case for a new initiative",
        ],
        "content": """\
# Business Case: {{INITIATIVE_TITLE}}

**Prepared by:** {{AUTHOR}}
**Date:** {{DATE}}
**Sponsor:** {{SPONSOR}}
**Status:** Draft

---

## Executive Summary

{{EXECUTIVE_SUMMARY}}

---

## Problem Statement

{{PROBLEM}}

---

## Proposed Solution

{{SOLUTION}}

---

## Options Considered

| Option | Description | Pros | Cons |
| --- | --- | --- | --- |
| Option A (Recommended) | {{OPTION_A}} | {{PROS_A}} | {{CONS_A}} |
| Option B | {{OPTION_B}} | {{PROS_B}} | {{CONS_B}} |
| Do nothing | Status quo | Low risk | Problem persists |

---

## Cost-Benefit Analysis

| Item | Year 1 | Year 2 | Year 3 |
| --- | --- | --- | --- |
| Investment | {{COST_Y1}} | {{COST_Y2}} | {{COST_Y3}} |
| Expected benefit | {{BENEFIT_Y1}} | {{BENEFIT_Y2}} | {{BENEFIT_Y3}} |
| **Net** | **{{NET_Y1}}** | **{{NET_Y2}}** | **{{NET_Y3}}** |

**Payback period:** {{PAYBACK}}
**3-year ROI:** {{ROI}}

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| {{RISK_1}} | {{LIKELIHOOD_1}} | {{IMPACT_1}} | {{MITIGATION_1}} |
| {{RISK_2}} | {{LIKELIHOOD_2}} | {{IMPACT_2}} | {{MITIGATION_2}} |

---

## Timeline

| Milestone | Target Date |
| --- | --- |
| Approval | {{APPROVAL_DATE}} |
| Kick-off | {{KICKOFF_DATE}} |
| Go-live | {{GOLIVE_DATE}} |

---

## Recommendation

{{RECOMMENDATION}}

**Approval requested from:** {{APPROVER}} by **{{APPROVAL_DEADLINE}}**
""",
    },
    {
        "id": "requirements-spec",
        "title": "Requirements Specification",
        "profiles": ["business-analyst", "project-manager"],
        "keywords": ["requirements", "spec", "brs", "frs", "functional", "user story", "system", "technical"],
        "use_cases": ["Write functional requirements", "Create a system spec", "Document user stories"],
        "content": """\
# Requirements Specification: {{SYSTEM_OR_PROJECT}}

**Version:** {{VERSION}}
**Author:** {{AUTHOR}}
**Date:** {{DATE}}
**Status:** {{STATUS}}

---

## 1. Overview

### 1.1 Purpose
{{PURPOSE}}

### 1.2 Scope
{{SCOPE}}

### 1.3 Stakeholders

| Stakeholder | Role | Interest |
| --- | --- | --- |
| {{STAKEHOLDER_1}} | {{ROLE_1}} | {{INTEREST_1}} |
| {{STAKEHOLDER_2}} | {{ROLE_2}} | {{INTEREST_2}} |

---

## 2. Functional Requirements

| ID | Requirement | Priority | Notes |
| --- | --- | --- | --- |
| FR-01 | {{REQ_1}} | Must | {{NOTES_1}} |
| FR-02 | {{REQ_2}} | Should | {{NOTES_2}} |
| FR-03 | {{REQ_3}} | Could | {{NOTES_3}} |

---

## 3. Non-Functional Requirements

| Category | Requirement |
| --- | --- |
| Performance | {{PERFORMANCE}} |
| Security | {{SECURITY}} |
| Availability | {{AVAILABILITY}} |
| Scalability | {{SCALABILITY}} |

---

## 4. Constraints & Assumptions

**Constraints:** {{CONSTRAINTS}}
**Assumptions:** {{ASSUMPTIONS}}
**Out of scope:** {{OUT_OF_SCOPE}}

---

## 5. Acceptance Criteria

{{ACCEPTANCE_CRITERIA}}

---

## 6. Approval

| Name | Role | Signature | Date |
| --- | --- | --- | --- |
| {{APPROVER_1}} | {{ROLE_1}} | | |
""",
    },
    {
        "id": "gap-analysis",
        "title": "Gap Analysis",
        "profiles": ["business-analyst", "operations"],
        "keywords": ["gap analysis", "current state", "future state", "as-is", "to-be", "improvement", "delta"],
        "use_cases": ["Analyse capability gaps", "Compare current vs target state", "Identify process improvements"],
        "content": """\
# Gap Analysis: {{SUBJECT}}

**Author:** {{AUTHOR}}
**Date:** {{DATE}}

---

## Current State (As-Is)

{{CURRENT_STATE}}

## Target State (To-Be)

{{TARGET_STATE}}

---

## Gap Summary

| Area | Current State | Target State | Gap | Priority |
| --- | --- | --- | --- | --- |
| {{AREA_1}} | {{CURRENT_1}} | {{TARGET_1}} | {{GAP_1}} | High |
| {{AREA_2}} | {{CURRENT_2}} | {{TARGET_2}} | {{GAP_2}} | Medium |
| {{AREA_3}} | {{CURRENT_3}} | {{TARGET_3}} | {{GAP_3}} | Low |

---

## Root Causes

{{ROOT_CAUSES}}

---

## Recommendations to Close Gaps

| Gap | Action | Owner | Timeline | Effort |
| --- | --- | --- | --- | --- |
| {{GAP_1}} | {{ACTION_1}} | {{OWNER_1}} | {{TIMELINE_1}} | {{EFFORT_1}} |
| {{GAP_2}} | {{ACTION_2}} | {{OWNER_2}} | {{TIMELINE_2}} | {{EFFORT_2}} |

---

## Conclusion

{{CONCLUSION}}
""",
    },
    {
        "id": "swot-analysis",
        "title": "SWOT / Competitive Analysis",
        "profiles": ["business-analyst", "marketing", "startup"],
        "keywords": ["swot", "strengths", "weaknesses", "opportunities", "threats", "competitive", "landscape"],
        "use_cases": ["Conduct a SWOT analysis", "Analyse competitors", "Assess market position"],
        "content": """\
# SWOT Analysis: {{SUBJECT}}

**Author:** {{AUTHOR}}  **Date:** {{DATE}}

---

## Strengths

- {{STRENGTH_1}}
- {{STRENGTH_2}}
- {{STRENGTH_3}}

## Weaknesses

- {{WEAKNESS_1}}
- {{WEAKNESS_2}}
- {{WEAKNESS_3}}

## Opportunities

- {{OPPORTUNITY_1}}
- {{OPPORTUNITY_2}}
- {{OPPORTUNITY_3}}

## Threats

- {{THREAT_1}}
- {{THREAT_2}}
- {{THREAT_3}}

---

## Competitive Landscape

| Competitor | Strengths | Weaknesses | Market Position |
| --- | --- | --- | --- |
| {{COMPETITOR_1}} | {{COMP_STR_1}} | {{COMP_WEAK_1}} | {{COMP_POS_1}} |
| {{COMPETITOR_2}} | {{COMP_STR_2}} | {{COMP_WEAK_2}} | {{COMP_POS_2}} |

---

## Strategic Implications

{{STRATEGIC_IMPLICATIONS}}
""",
    },
    {
        "id": "stakeholder-analysis",
        "title": "Stakeholder Analysis",
        "profiles": ["business-analyst", "project-manager"],
        "keywords": ["stakeholder", "influence", "interest", "comms", "engagement", "mapping"],
        "use_cases": ["Map project stakeholders", "Plan stakeholder engagement", "Identify key decision makers"],
        "content": """\
# Stakeholder Analysis: {{PROJECT}}

**Author:** {{AUTHOR}}  **Date:** {{DATE}}

---

## Stakeholder Register

| Name | Role / Organisation | Interest | Influence | Attitude | Engagement Strategy |
| --- | --- | --- | --- | --- | --- |
| {{NAME_1}} | {{ORG_1}} | {{INTEREST_1}} | High | Supportive | Keep informed |
| {{NAME_2}} | {{ORG_2}} | {{INTEREST_2}} | High | Neutral | Manage closely |
| {{NAME_3}} | {{ORG_3}} | {{INTEREST_3}} | Low | Resistant | Monitor |

---

## Influence / Interest Matrix

- **Manage Closely** (High influence, High interest): {{MANAGE_CLOSELY}}
- **Keep Satisfied** (High influence, Low interest): {{KEEP_SATISFIED}}
- **Keep Informed** (Low influence, High interest): {{KEEP_INFORMED}}
- **Monitor** (Low influence, Low interest): {{MONITOR}}

---

## Key Concerns & Mitigation

| Stakeholder | Key Concern | Mitigation |
| --- | --- | --- |
| {{NAME_1}} | {{CONCERN_1}} | {{MITIGATION_1}} |
| {{NAME_2}} | {{CONCERN_2}} | {{MITIGATION_2}} |

---

## Communication Plan

| Stakeholder | Channel | Frequency | Content |
| --- | --- | --- | --- |
| {{NAME_1}} | {{CHANNEL_1}} | {{FREQ_1}} | {{CONTENT_1}} |
""",
    },
    {
        "id": "project-charter",
        "title": "Project Charter",
        "profiles": ["project-manager", "business-analyst"],
        "keywords": ["project charter", "kick-off", "mandate", "scope", "objectives", "sponsor", "deliverables"],
        "use_cases": ["Create a project charter", "Kick off a new project", "Define project mandate"],
        "content": """\
# Project Charter: {{PROJECT_NAME}}

**Project Manager:** {{PM}}
**Sponsor:** {{SPONSOR}}
**Start Date:** {{START_DATE}}
**End Date:** {{END_DATE}}

---

## Project Purpose

{{PURPOSE}}

## Objectives

1. {{OBJECTIVE_1}}
2. {{OBJECTIVE_2}}
3. {{OBJECTIVE_3}}

## Scope

**In scope:** {{IN_SCOPE}}
**Out of scope:** {{OUT_OF_SCOPE}}

---

## Deliverables

| Deliverable | Description | Due Date |
| --- | --- | --- |
| {{DELIVERABLE_1}} | {{DESC_1}} | {{DUE_1}} |
| {{DELIVERABLE_2}} | {{DESC_2}} | {{DUE_2}} |

---

## Team

| Name | Role | Availability |
| --- | --- | --- |
| {{MEMBER_1}} | {{ROLE_1}} | {{AVAIL_1}} |
| {{MEMBER_2}} | {{ROLE_2}} | {{AVAIL_2}} |

---

## Budget

**Approved budget:** {{BUDGET}}
**Budget owner:** {{BUDGET_OWNER}}

---

## Key Risks

| Risk | Likelihood | Impact |
| --- | --- | --- |
| {{RISK_1}} | {{L_1}} | {{I_1}} |

---

## Approval

Signed off by **{{SPONSOR}}** on **{{APPROVAL_DATE}}**.
""",
    },
    {
        "id": "executive-summary",
        "title": "Executive Summary",
        "profiles": ["business-analyst", "startup", "sales"],
        "keywords": ["executive summary", "overview", "highlights", "brief", "one page", "tldr", "summary"],
        "use_cases": ["Write an executive summary", "Summarise a long report", "Create a management overview"],
        "content": """\
# Executive Summary: {{TITLE}}

**Prepared by:** {{AUTHOR}}  **Date:** {{DATE}}  **Audience:** {{AUDIENCE}}

---

## Situation

{{SITUATION}}

---

## Key Findings

- {{FINDING_1}}
- {{FINDING_2}}
- {{FINDING_3}}

---

## Recommendation

{{RECOMMENDATION}}

---

## Financial Impact

| Metric | Value |
| --- | --- |
| Investment required | {{INVESTMENT}} |
| Expected return | {{RETURN}} |
| Timeline to value | {{TIMELINE}} |

---

## Next Steps

1. {{NEXT_1}} — by **{{DATE_1}}**
2. {{NEXT_2}} — by **{{DATE_2}}**

---

*Full report available: {{FULL_REPORT_LINK}}*
""",
    },
    {
        "id": "kpi-report",
        "title": "KPI / Performance Dashboard Report",
        "profiles": ["business-analyst", "operations", "finance", "marketing"],
        "keywords": ["kpi", "metrics", "performance", "dashboard", "scorecard", "targets", "results"],
        "use_cases": ["Write a monthly KPI report", "Create a performance scorecard", "Report on metrics"],
        "content": """\
# KPI Report — {{PERIOD}}

**Team / Function:** {{TEAM}}
**Author:** {{AUTHOR}}
**Date:** {{DATE}}

---

## Summary

{{SUMMARY}}

---

## KPI Scorecard

| KPI | Target | Actual | Status | Trend |
| --- | --- | --- | --- | --- |
| {{KPI_1}} | {{TARGET_1}} | {{ACTUAL_1}} | ✅ On track | ↑ |
| {{KPI_2}} | {{TARGET_2}} | {{ACTUAL_2}} | ⚠️ At risk | → |
| {{KPI_3}} | {{TARGET_3}} | {{ACTUAL_3}} | ❌ Off track | ↓ |

---

## Highlights

- **Best performer:** {{BEST_KPI}} — {{BEST_COMMENTARY}}
- **Needs attention:** {{WORST_KPI}} — {{WORST_COMMENTARY}}

---

## Root Cause Analysis (Underperforming KPIs)

{{ROOT_CAUSE}}

---

## Actions

| KPI | Action | Owner | Due |
| --- | --- | --- | --- |
| {{KPI_ISSUE}} | {{ACTION}} | {{OWNER}} | {{DUE}} |

---

## Outlook for Next Period

{{OUTLOOK}}
""",
    },
    {
        "id": "change-management-plan",
        "title": "Change Management Plan",
        "profiles": ["business-analyst", "hr", "project-manager", "operations"],
        "keywords": ["change management", "adoption", "communication", "training", "resistance", "transition"],
        "use_cases": [
            "Write a change management plan",
            "Plan an organisational change",
            "Create a change comms strategy",
        ],
        "content": """\
# Change Management Plan: {{INITIATIVE}}

**Author:** {{AUTHOR}}  **Date:** {{DATE}}
**Change Lead:** {{CHANGE_LEAD}}
**Executive Sponsor:** {{SPONSOR}}

---

## Change Summary

**What is changing:** {{WHAT_CHANGING}}
**Why it is changing:** {{WHY_CHANGING}}
**Who is affected:** {{WHO_AFFECTED}}
**Go-live date:** {{GO_LIVE}}

---

## Impact Assessment

| Group | Number Affected | Impact Level | Key Change |
| --- | --- | --- | --- |
| {{GROUP_1}} | {{COUNT_1}} | High | {{CHANGE_1}} |
| {{GROUP_2}} | {{COUNT_2}} | Medium | {{CHANGE_2}} |

---

## Readiness Assessment

| Criterion | Rating (1–5) | Notes |
| --- | --- | --- |
| Leadership alignment | {{RATING_1}} | {{NOTES_1}} |
| Employee awareness | {{RATING_2}} | {{NOTES_2}} |
| Training readiness | {{RATING_3}} | {{NOTES_3}} |

---

## Communication Plan

| Audience | Message | Channel | When | Owner |
| --- | --- | --- | --- | --- |
| {{AUD_1}} | {{MSG_1}} | {{CH_1}} | {{WHEN_1}} | {{OWN_1}} |
| {{AUD_2}} | {{MSG_2}} | {{CH_2}} | {{WHEN_2}} | {{OWN_2}} |

---

## Training Plan

| Group | Training Type | Duration | Delivery | Date |
| --- | --- | --- | --- | --- |
| {{GRP_1}} | {{TYPE_1}} | {{DUR_1}} | {{DEL_1}} | {{DATE_1}} |

---

## Resistance Management

| Anticipated Resistance | Root Cause | Mitigation |
| --- | --- | --- |
| {{RESIST_1}} | {{CAUSE_1}} | {{MITIG_1}} |

---

## Success Metrics

{{SUCCESS_METRICS}}
""",
    },
    # ═══════════════════════════════════════════════════════════════════════════════
    # MARKETING
    # ═══════════════════════════════════════════════════════════════════════════════
    {
        "id": "campaign-brief",
        "title": "Campaign Brief",
        "profiles": ["marketing"],
        "keywords": ["campaign", "marketing", "launch", "promotion", "ads", "creative", "campaign brief"],
        "use_cases": ["Write a campaign brief", "Plan a marketing campaign", "Brief an agency"],
        "content": """\
# Campaign Brief: {{CAMPAIGN_NAME}}

**Brand:** {{BRAND}}
**Campaign type:** {{CAMPAIGN_TYPE}}
**Prepared by:** {{AUTHOR}}
**Date:** {{DATE}}
**Campaign period:** {{START}} – {{END}}

---

## Objective

{{OBJECTIVE}}

**Success metrics:**
- {{METRIC_1}}: {{TARGET_1}}
- {{METRIC_2}}: {{TARGET_2}}

---

## Target Audience

**Primary:** {{PRIMARY_AUDIENCE}}
**Secondary:** {{SECONDARY_AUDIENCE}}
**Insight:** {{AUDIENCE_INSIGHT}}

---

## Key Message

{{KEY_MESSAGE}}

**Supporting messages:**
- {{SUPPORT_1}}
- {{SUPPORT_2}}

---

## Channels & Budget

| Channel | Tactic | Budget | KPI |
| --- | --- | --- | --- |
| {{CHANNEL_1}} | {{TACTIC_1}} | {{BUDGET_1}} | {{KPI_1}} |
| {{CHANNEL_2}} | {{TACTIC_2}} | {{BUDGET_2}} | {{KPI_2}} |
| **Total** | | **{{TOTAL_BUDGET}}** | |

---

## Creative Direction

**Tone:** {{TONE}}
**Visual style:** {{VISUAL}}
**Mandatory elements:** {{MANDATORY}}
**Do not use:** {{DONT}}

---

## Timeline

| Milestone | Date |
| --- | --- |
| Brief approved | {{DATE_1}} |
| Creative concepts | {{DATE_2}} |
| Final assets | {{DATE_3}} |
| Campaign live | {{DATE_4}} |
""",
    },
    {
        "id": "content-calendar",
        "title": "Content Calendar",
        "profiles": ["marketing"],
        "keywords": ["content calendar", "editorial calendar", "social media", "schedule", "posts", "publishing"],
        "use_cases": ["Create a content calendar", "Plan social media posts", "Schedule editorial content"],
        "content": """\
# Content Calendar — {{MONTH_YEAR}}

**Brand:** {{BRAND}}
**Managed by:** {{AUTHOR}}

---

## Monthly Themes & Goals

**Theme:** {{THEME}}
**Goals:** {{GOALS}}

---

## Weekly Overview

| Week | Theme / Focus | Key Events | Content Types |
| --- | --- | --- | --- |
| Week 1 ({{DATES_1}}) | {{FOCUS_1}} | {{EVENTS_1}} | {{TYPES_1}} |
| Week 2 ({{DATES_2}}) | {{FOCUS_2}} | {{EVENTS_2}} | {{TYPES_2}} |
| Week 3 ({{DATES_3}}) | {{FOCUS_3}} | {{EVENTS_3}} | {{TYPES_3}} |
| Week 4 ({{DATES_4}}) | {{FOCUS_4}} | {{EVENTS_4}} | {{TYPES_4}} |

---

## Content Schedule

| Date | Platform | Format | Topic / Caption | Asset | Status |
| --- | --- | --- | --- | --- | --- |
| {{DATE_1}} | {{PLATFORM_1}} | {{FORMAT_1}} | {{TOPIC_1}} | {{ASSET_1}} | Draft |
| {{DATE_2}} | {{PLATFORM_2}} | {{FORMAT_2}} | {{TOPIC_2}} | {{ASSET_2}} | Draft |
| {{DATE_3}} | {{PLATFORM_3}} | {{FORMAT_3}} | {{TOPIC_3}} | {{ASSET_3}} | Draft |

---

## Hashtags & Tags

{{HASHTAGS}}

---

## Notes

{{NOTES}}
""",
    },
    {
        "id": "press-release",
        "title": "Press Release",
        "profiles": ["marketing", "startup"],
        "keywords": ["press release", "announcement", "media", "news", "launch", "PR", "journalist"],
        "use_cases": ["Write a press release", "Announce a product launch", "Create a media statement"],
        "content": """\
FOR IMMEDIATE RELEASE

# {{HEADLINE}}

**{{SUBHEADLINE}}**

**{{CITY}}, {{DATE}}** — {{COMPANY}} today announced {{ANNOUNCEMENT_SUMMARY}}.

{{PARAGRAPH_1}}

{{PARAGRAPH_2}}

## Quote from {{EXECUTIVE_NAME}}, {{EXECUTIVE_TITLE}}

"{{QUOTE}}"

{{PARAGRAPH_3}}

---

## About {{COMPANY}}

{{COMPANY_BOILERPLATE}}

---

## Media Contact

**{{CONTACT_NAME}}**
{{CONTACT_TITLE}}
{{COMPANY}}
{{EMAIL}} | {{PHONE}}

###
""",
    },
    {
        "id": "blog-post",
        "title": "Blog Post / Article",
        "profiles": ["marketing", "researcher"],
        "keywords": ["blog", "article", "post", "content", "write", "draft", "seo", "editorial"],
        "use_cases": ["Write a blog post", "Draft an article", "Create web content"],
        "content": """\
# {{TITLE}}

*By {{AUTHOR}} · {{DATE}} · {{READ_TIME}} min read*

---

## Introduction

{{HOOK}}

{{INTRO_PARAGRAPH}}

---

## {{SECTION_1_HEADING}}

{{SECTION_1_CONTENT}}

### {{SUBSECTION_1}}

{{SUBSECTION_1_CONTENT}}

---

## {{SECTION_2_HEADING}}

{{SECTION_2_CONTENT}}

---

## {{SECTION_3_HEADING}}

{{SECTION_3_CONTENT}}

---

## Key Takeaways

- {{TAKEAWAY_1}}
- {{TAKEAWAY_2}}
- {{TAKEAWAY_3}}

---

## Conclusion

{{CONCLUSION}}

---

*{{CTA}}*

**Tags:** {{TAGS}}
""",
    },
    {
        "id": "social-media-pack",
        "title": "Social Media Copy Pack",
        "profiles": ["marketing"],
        "keywords": ["social media", "twitter", "linkedin", "instagram", "copy", "posts", "captions"],
        "use_cases": ["Write social media posts", "Create a copy pack", "Draft captions for a campaign"],
        "content": """\
# Social Media Copy Pack: {{CAMPAIGN_OR_TOPIC}}

**Brand:** {{BRAND}}
**Date:** {{DATE}}
**Tone:** {{TONE}}

---

## LinkedIn

### Post 1
{{LINKEDIN_POST_1}}
*({{CHARACTER_COUNT_1}} chars · suggested image: {{IMAGE_1}})*

### Post 2
{{LINKEDIN_POST_2}}

---

## X / Twitter

### Tweet 1
{{TWEET_1}}
*({{CHARS_T1}} chars)*

### Tweet 2
{{TWEET_2}}

### Thread starter
{{THREAD_1}}
1/ {{THREAD_BODY_1}}
2/ {{THREAD_BODY_2}}
3/ {{THREAD_BODY_3}}

---

## Instagram

### Caption 1
{{INSTAGRAM_1}}
.
.
.
{{HASHTAGS}}

---

## Email subject lines (A/B)

- **A:** {{SUBJECT_A}}
- **B:** {{SUBJECT_B}}

---

## Notes

{{NOTES}}
""",
    },
    {
        "id": "brand-messaging",
        "title": "Brand Messaging Guide",
        "profiles": ["marketing", "startup"],
        "keywords": ["brand", "messaging", "tone of voice", "positioning", "tagline", "value proposition", "story"],
        "use_cases": ["Write brand messaging", "Define tone of voice", "Create a positioning guide"],
        "content": """\
# Brand Messaging Guide: {{BRAND}}

**Version:** {{VERSION}}  **Date:** {{DATE}}

---

## Mission

{{MISSION}}

## Vision

{{VISION}}

## Values

- **{{VALUE_1}}:** {{VALUE_DESC_1}}
- **{{VALUE_2}}:** {{VALUE_DESC_2}}
- **{{VALUE_3}}:** {{VALUE_DESC_3}}

---

## Positioning Statement

For **{{TARGET_AUDIENCE}}** who **{{PAIN_POINT}}**, **{{BRAND}}** is the **{{CATEGORY}}** that **{{KEY_BENEFIT}}**. Unlike **{{ALTERNATIVES}}**, we **{{DIFFERENTIATOR}}**.

---

## Tagline Options

- **Primary:** {{TAGLINE_1}}
- **Alternative:** {{TAGLINE_2}}

---

## Elevator Pitch (30 seconds)

{{ELEVATOR_PITCH}}

---

## Tone of Voice

| Attribute | We are | We are not |
| --- | --- | --- |
| {{TOV_1}} | {{YES_1}} | {{NOT_1}} |
| {{TOV_2}} | {{YES_2}} | {{NOT_2}} |
| {{TOV_3}} | {{YES_3}} | {{NOT_3}} |

---

## Key Messages by Audience

| Audience | Core Message | Proof Point |
| --- | --- | --- |
| {{AUD_1}} | {{MSG_1}} | {{PROOF_1}} |
| {{AUD_2}} | {{MSG_2}} | {{PROOF_2}} |

---

## Words to Use / Avoid

**Use:** {{USE_WORDS}}
**Avoid:** {{AVOID_WORDS}}
""",
    },
    {
        "id": "email-sequence",
        "title": "Email Sequence (Drip Campaign)",
        "profiles": ["marketing", "sales"],
        "keywords": ["email", "drip", "sequence", "nurture", "onboarding", "automation", "newsletter"],
        "use_cases": ["Write an email sequence", "Create a nurture campaign", "Draft onboarding emails"],
        "content": """\
# Email Sequence: {{SEQUENCE_NAME}}

**Goal:** {{GOAL}}
**Audience:** {{AUDIENCE}}
**Trigger:** {{TRIGGER}}

---

## Email 1 — Day {{DAY_1}}: {{SUBJECT_1}}

**Subject:** {{SUBJECT_1}}
**Preview text:** {{PREVIEW_1}}

{{BODY_1}}

**CTA:** {{CTA_1}}

---

## Email 2 — Day {{DAY_2}}: {{SUBJECT_2}}

**Subject:** {{SUBJECT_2}}
**Preview text:** {{PREVIEW_2}}

{{BODY_2}}

**CTA:** {{CTA_2}}

---

## Email 3 — Day {{DAY_3}}: {{SUBJECT_3}}

**Subject:** {{SUBJECT_3}}
**Preview text:** {{PREVIEW_3}}

{{BODY_3}}

**CTA:** {{CTA_3}}

---

## Email 4 — Day {{DAY_4}}: {{SUBJECT_4}} *(Re-engagement)*

**Subject:** {{SUBJECT_4}}

{{BODY_4}}

**CTA:** {{CTA_4}}

---

## Notes

- Unsubscribe: included in footer of all emails
- Sender name: {{SENDER}}
- Reply-to: {{REPLY_TO}}
""",
    },
    {
        "id": "case-study",
        "title": "Case Study / Customer Story",
        "profiles": ["marketing", "sales"],
        "keywords": ["case study", "customer story", "success story", "testimonial", "results", "client"],
        "use_cases": ["Write a customer case study", "Create a success story", "Document client results"],
        "content": """\
# Case Study: {{CUSTOMER}} × {{YOUR_COMPANY}}

**Industry:** {{INDUSTRY}}
**Company size:** {{COMPANY_SIZE}}
**Use case:** {{USE_CASE}}

---

## The Challenge

{{CUSTOMER}} faced **{{PROBLEM}}**.

{{CHALLENGE_DETAIL}}

> "{{CHALLENGE_QUOTE}}" — {{QUOTE_PERSON}}, {{QUOTE_TITLE}}

---

## The Solution

{{CUSTOMER}} chose {{YOUR_COMPANY}} because {{REASON}}.

**Key features used:**
- {{FEATURE_1}}
- {{FEATURE_2}}
- {{FEATURE_3}}

**Implementation:** {{IMPLEMENTATION_DETAIL}}

---

## The Results

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| {{METRIC_1}} | {{BEFORE_1}} | {{AFTER_1}} | {{CHANGE_1}} |
| {{METRIC_2}} | {{BEFORE_2}} | {{AFTER_2}} | {{CHANGE_2}} |
| {{METRIC_3}} | {{BEFORE_3}} | {{AFTER_3}} | {{CHANGE_3}} |

> "{{RESULT_QUOTE}}" — {{QUOTE_PERSON}}, {{QUOTE_TITLE}}

---

## What's Next

{{NEXT_STEPS}}

---

*Learn more at {{URL}}*
""",
    },
    {
        "id": "product-launch-plan",
        "title": "Product Launch Plan",
        "profiles": ["marketing", "startup", "project-manager"],
        "keywords": ["product launch", "go-live", "release", "launch plan", "product", "gtm", "rollout"],
        "use_cases": ["Plan a product launch", "Create a launch checklist", "Write a go-live plan"],
        "content": """\
# Product Launch Plan: {{PRODUCT_NAME}}

**Launch date:** {{LAUNCH_DATE}}
**Owner:** {{OWNER}}
**Date prepared:** {{DATE}}

---

## Launch Overview

{{OVERVIEW}}

**Target audiences:** {{AUDIENCES}}
**Key value proposition:** {{VALUE_PROP}}

---

## Pre-Launch Checklist

| Task | Owner | Due | Status |
| --- | --- | --- | --- |
| {{TASK_1}} | {{OWNER_1}} | {{DUE_1}} | ☐ |
| {{TASK_2}} | {{OWNER_2}} | {{DUE_2}} | ☐ |
| {{TASK_3}} | {{OWNER_3}} | {{DUE_3}} | ☐ |

---

## Launch Day Plan

| Time | Activity | Owner |
| --- | --- | --- |
| {{TIME_1}} | {{ACTIVITY_1}} | {{PERSON_1}} |
| {{TIME_2}} | {{ACTIVITY_2}} | {{PERSON_2}} |

---

## Marketing & Comms

| Channel | Content | Publish Date |
| --- | --- | --- |
| {{CHANNEL_1}} | {{CONTENT_1}} | {{DATE_1}} |
| {{CHANNEL_2}} | {{CONTENT_2}} | {{DATE_2}} |

---

## Success Metrics

| KPI | Target | Measurement |
| --- | --- | --- |
| {{KPI_1}} | {{TARGET_1}} | {{METHOD_1}} |
| {{KPI_2}} | {{TARGET_2}} | {{METHOD_2}} |

---

## Contingency Plan

{{CONTINGENCY}}
""",
    },
    {
        "id": "seo-brief",
        "title": "SEO Content Brief",
        "profiles": ["marketing"],
        "keywords": ["seo", "content brief", "keywords", "search", "ranking", "organic", "blog", "article"],
        "use_cases": ["Create an SEO brief", "Plan keyword-optimised content", "Brief a writer for search"],
        "content": """\
# SEO Content Brief: {{PAGE_TITLE}}

**URL slug:** {{SLUG}}
**Author:** {{AUTHOR}}
**Target publish date:** {{DATE}}

---

## Target Keywords

| Keyword | Monthly Volume | Difficulty | Intent |
| --- | --- | --- | --- |
| {{KW_PRIMARY}} | {{VOL_1}} | {{DIFF_1}} | Informational |
| {{KW_SECONDARY_1}} | {{VOL_2}} | {{DIFF_2}} | |
| {{KW_SECONDARY_2}} | {{VOL_3}} | {{DIFF_3}} | |

---

## Content Goal

{{GOAL}}

**Target audience:** {{AUDIENCE}}
**Search intent:** {{INTENT}}

---

## Recommended Structure

| Section | H-Tag | Keyword Focus | Word Count |
| --- | --- | --- | --- |
| {{SECTION_1}} | H1 | {{PRIMARY_KW}} | {{WORDS_1}} |
| {{SECTION_2}} | H2 | {{KW_2}} | {{WORDS_2}} |
| {{SECTION_3}} | H2 | {{KW_3}} | {{WORDS_3}} |

**Total target word count:** {{TOTAL_WORDS}}

---

## Competitors to Outrank

| URL | Word Count | Key Gaps |
| --- | --- | --- |
| {{COMP_1}} | {{COMP_WC_1}} | {{GAP_1}} |
| {{COMP_2}} | {{COMP_WC_2}} | {{GAP_2}} |

---

## On-Page Requirements

- **Title tag:** {{TITLE_TAG}} (≤ 60 chars)
- **Meta description:** {{META_DESC}} (≤ 155 chars)
- **Internal links:** {{INTERNAL_LINKS}}
- **CTA:** {{CTA}}
- **Image alt text guidance:** {{IMAGE_ALT}}
""",
    },
    # ═══════════════════════════════════════════════════════════════════════════════
    # LEGAL
    # ═══════════════════════════════════════════════════════════════════════════════
    {
        "id": "nda",
        "title": "Non-Disclosure Agreement (NDA)",
        "profiles": ["legal", "startup", "sales"],
        "keywords": ["nda", "non-disclosure", "confidential", "confidentiality", "secret", "ip", "proprietary"],
        "use_cases": ["Create an NDA", "Draft a confidentiality agreement", "Write a non-disclosure agreement"],
        "content": """\
# Non-Disclosure Agreement

**Effective Date:** {{DATE}}

**Disclosing Party:** {{PARTY_A}} ("Discloser")
**Receiving Party:** {{PARTY_B}} ("Recipient")

---

## 1. Confidential Information

"Confidential Information" means any non-public information disclosed by Discloser to Recipient, including but not limited to {{SCOPE_OF_INFO}}.

Excluded: information that is publicly known, already known to Recipient, or independently developed.

---

## 2. Obligations

Recipient agrees to:
- Keep Confidential Information strictly confidential
- Use it solely for {{PURPOSE}}
- Not disclose it to third parties without prior written consent
- Apply at least the same protection as its own confidential information (but no less than reasonable care)

---

## 3. Term

This Agreement is effective for **{{DURATION}}** from the Effective Date.

---

## 4. Return / Destruction

Upon request, Recipient shall promptly return or destroy all Confidential Information.

---

## 5. Governing Law

This Agreement is governed by the laws of **{{JURISDICTION}}**.

---

## 6. Remedies

Recipient acknowledges that breach may cause irreparable harm and that Discloser is entitled to seek injunctive relief in addition to other remedies.

---

## Signatures

| Discloser | Recipient |
| --- | --- |
| Signature: _______________ | Signature: _______________ |
| Name: {{NAME_A}} | Name: {{NAME_B}} |
| Title: {{TITLE_A}} | Title: {{TITLE_B}} |
| Date: _______________ | Date: _______________ |
""",
    },
    {
        "id": "privacy-policy",
        "title": "Privacy Policy",
        "profiles": ["legal", "startup"],
        "keywords": ["privacy policy", "gdpr", "data", "personal data", "cookies", "privacy", "compliance"],
        "use_cases": ["Write a privacy policy", "Draft GDPR-compliant policy", "Create a data protection notice"],
        "content": """\
# Privacy Policy

**{{COMPANY_NAME}}**
**Last updated:** {{DATE}}

---

## 1. Who We Are

{{COMPANY_NAME}} ("we", "our", "us") is {{COMPANY_DESCRIPTION}}. Our registered address is {{ADDRESS}}.

---

## 2. Data We Collect

| Data Type | Purpose | Legal Basis |
| --- | --- | --- |
| {{DATA_1}} | {{PURPOSE_1}} | {{BASIS_1}} |
| {{DATA_2}} | {{PURPOSE_2}} | {{BASIS_2}} |
| {{DATA_3}} | {{PURPOSE_3}} | {{BASIS_3}} |

---

## 3. How We Use Your Data

{{USE_DESCRIPTION}}

---

## 4. Sharing Your Data

We share data with: {{THIRD_PARTIES}}. We do not sell personal data.

---

## 5. Cookies

{{COOKIE_DESCRIPTION}}

---

## 6. Retention

We retain data for {{RETENTION_PERIOD}} or as required by law.

---

## 7. Your Rights

You have the right to: access, correct, delete, restrict, port, and object to processing of your data. To exercise these rights, contact {{CONTACT_EMAIL}}.

---

## 8. International Transfers

{{INTERNATIONAL_TRANSFERS}}

---

## 9. Contact

**Data Controller:** {{CONTROLLER_NAME}}
**Email:** {{CONTACT_EMAIL}}
**Address:** {{ADDRESS}}

---

## 10. Changes

We will notify you of material changes by {{NOTIFICATION_METHOD}}.
""",
    },
    {
        "id": "compliance-audit",
        "title": "Compliance Audit Report",
        "profiles": ["legal", "operations", "finance"],
        "keywords": ["compliance", "audit", "regulatory", "findings", "controls", "remediation", "assessment"],
        "use_cases": ["Write a compliance audit report", "Document audit findings", "Assess regulatory compliance"],
        "content": """\
# Compliance Audit Report: {{AUDIT_SUBJECT}}

**Audit period:** {{PERIOD}}
**Auditor:** {{AUDITOR}}
**Date issued:** {{DATE}}
**Classification:** {{CLASSIFICATION}}

---

## Executive Summary

{{EXECUTIVE_SUMMARY}}

**Overall rating:** {{OVERALL_RATING}} ({{RATING_SCALE}})

---

## Scope & Methodology

**Scope:** {{SCOPE}}
**Standards / regulations:** {{STANDARDS}}
**Methodology:** {{METHODOLOGY}}

---

## Findings Summary

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| 1 | {{FINDING_1}} | Critical | Open |
| 2 | {{FINDING_2}} | High | Open |
| 3 | {{FINDING_3}} | Medium | In progress |
| 4 | {{FINDING_4}} | Low | Closed |

---

## Detailed Findings

### Finding 1: {{FINDING_1}}

**Severity:** Critical
**Requirement:** {{REQUIREMENT_1}}
**Observation:** {{OBSERVATION_1}}
**Risk:** {{RISK_1}}
**Recommendation:** {{RECOMMENDATION_1}}
**Management response:** {{RESPONSE_1}}
**Remediation deadline:** {{DEADLINE_1}}

### Finding 2: {{FINDING_2}}

**Severity:** High
**Requirement:** {{REQUIREMENT_2}}
**Observation:** {{OBSERVATION_2}}
**Recommendation:** {{RECOMMENDATION_2}}

---

## Remediation Plan

| Finding | Action | Owner | Due |
| --- | --- | --- | --- |
| 1 | {{ACTION_1}} | {{OWNER_1}} | {{DUE_1}} |
| 2 | {{ACTION_2}} | {{OWNER_2}} | {{DUE_2}} |

---

## Conclusion

{{CONCLUSION}}
""",
    },
    {
        "id": "risk-assessment",
        "title": "Risk Assessment",
        "profiles": ["legal", "business-analyst", "project-manager", "operations"],
        "keywords": ["risk", "risk assessment", "risk register", "mitigation", "probability", "impact", "control"],
        "use_cases": ["Write a risk assessment", "Create a risk register", "Assess project risks"],
        "content": """\
# Risk Assessment: {{SUBJECT}}

**Prepared by:** {{AUTHOR}}
**Date:** {{DATE}}
**Review date:** {{REVIEW_DATE}}

---

## Risk Rating Matrix

| Likelihood \\ Impact | Low | Medium | High |
| --- | --- | --- | --- |
| High | Medium | High | Critical |
| Medium | Low | Medium | High |
| Low | Low | Low | Medium |

---

## Risk Register

| ID | Risk | Category | Likelihood | Impact | Rating | Controls | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | {{RISK_1}} | {{CAT_1}} | High | High | Critical | {{CONTROL_1}} | {{OWNER_1}} | Open |
| R-02 | {{RISK_2}} | {{CAT_2}} | Medium | High | High | {{CONTROL_2}} | {{OWNER_2}} | Mitigating |
| R-03 | {{RISK_3}} | {{CAT_3}} | Low | Medium | Low | {{CONTROL_3}} | {{OWNER_3}} | Closed |

---

## Detailed Risk Entries

### R-01: {{RISK_1}}

**Description:** {{RISK_DESC_1}}
**Trigger:** {{TRIGGER_1}}
**Consequence:** {{CONSEQUENCE_1}}
**Existing controls:** {{EXISTING_1}}
**Additional controls needed:** {{ADDITIONAL_1}}
**Residual risk:** {{RESIDUAL_1}}

---

## Action Plan

| Risk ID | Action | Owner | Due | Status |
| --- | --- | --- | --- | --- |
| R-01 | {{ACTION_1}} | {{OWNER_1}} | {{DUE_1}} | Open |

---

## Sign-off

Reviewed by **{{REVIEWER}}** on **{{DATE}}**.
""",
    },
    {
        "id": "legal-memo",
        "title": "Legal Memorandum",
        "profiles": ["legal"],
        "keywords": ["legal memo", "memorandum", "legal opinion", "advice", "counsel", "law", "analysis"],
        "use_cases": ["Write a legal memo", "Draft a legal opinion", "Provide legal analysis"],
        "content": """\
# Legal Memorandum

**TO:** {{RECIPIENT}}
**FROM:** {{AUTHOR}}
**DATE:** {{DATE}}
**RE:** {{SUBJECT}}
**PRIVILEGE:** {{PRIVILEGE_STATUS}}

---

## Question Presented

{{QUESTION}}

---

## Brief Answer

{{BRIEF_ANSWER}}

---

## Facts

{{FACTS}}

---

## Analysis

### Issue 1: {{ISSUE_1}}

**Applicable law:** {{LAW_1}}

{{ANALYSIS_1}}

### Issue 2: {{ISSUE_2}}

**Applicable law:** {{LAW_2}}

{{ANALYSIS_2}}

---

## Conclusion

{{CONCLUSION}}

---

## Recommendations

1. {{RECOMMENDATION_1}}
2. {{RECOMMENDATION_2}}

---

*This memorandum is prepared for internal use only and constitutes legal advice subject to attorney-client privilege.*
""",
    },
    {
        "id": "incident-report",
        "title": "Incident Report",
        "profiles": ["legal", "operations", "hr"],
        "keywords": ["incident", "accident", "breach", "security", "report", "investigation", "event"],
        "use_cases": ["Write an incident report", "Document a security breach", "Report a workplace incident"],
        "content": """\
# Incident Report

**Incident ID:** {{INCIDENT_ID}}
**Date of incident:** {{INCIDENT_DATE}}
**Time:** {{TIME}}
**Reported by:** {{REPORTER}}
**Report date:** {{REPORT_DATE}}
**Classification:** {{SEVERITY}} (Critical / High / Medium / Low)

---

## Incident Summary

{{SUMMARY}}

---

## Incident Details

**Location / System:** {{LOCATION}}
**Type:** {{INCIDENT_TYPE}}
**Affected parties:** {{AFFECTED}}
**Initial detection:** {{DETECTION}}

---

## Timeline of Events

| Time | Event |
| --- | --- |
| {{TIME_1}} | {{EVENT_1}} |
| {{TIME_2}} | {{EVENT_2}} |
| {{TIME_3}} | {{EVENT_3}} |

---

## Impact Assessment

**Business impact:** {{BUSINESS_IMPACT}}
**Data impact:** {{DATA_IMPACT}}
**Financial impact:** {{FINANCIAL_IMPACT}}
**Reputational impact:** {{REPUTATIONAL_IMPACT}}

---

## Root Cause

{{ROOT_CAUSE}}

---

## Immediate Actions Taken

- {{ACTION_1}}
- {{ACTION_2}}

---

## Corrective Actions

| Action | Owner | Due | Status |
| --- | --- | --- | --- |
| {{CORR_1}} | {{OWNER_1}} | {{DUE_1}} | Open |
| {{CORR_2}} | {{OWNER_2}} | {{DUE_2}} | Open |

---

## Lessons Learned

{{LESSONS}}
""",
    },
    # ═══════════════════════════════════════════════════════════════════════════════
    # HR
    # ═══════════════════════════════════════════════════════════════════════════════
    {
        "id": "job-description",
        "title": "Job Description",
        "profiles": ["hr"],
        "keywords": ["job description", "jd", "role", "hiring", "vacancy", "position", "recruitment", "job posting"],
        "use_cases": ["Write a job description", "Create a job posting", "Define a new role"],
        "content": """\
# {{JOB_TITLE}}

**Department:** {{DEPARTMENT}}
**Reports to:** {{REPORTS_TO}}
**Location:** {{LOCATION}}
**Type:** {{EMPLOYMENT_TYPE}} (Full-time / Part-time / Contract)
**Salary range:** {{SALARY_RANGE}}

---

## About {{COMPANY}}

{{COMPANY_DESCRIPTION}}

---

## Role Overview

{{ROLE_OVERVIEW}}

---

## Key Responsibilities

- {{RESPONSIBILITY_1}}
- {{RESPONSIBILITY_2}}
- {{RESPONSIBILITY_3}}
- {{RESPONSIBILITY_4}}
- {{RESPONSIBILITY_5}}

---

## Required Qualifications

- {{REQUIRED_1}}
- {{REQUIRED_2}}
- {{REQUIRED_3}}

## Preferred Qualifications

- {{PREFERRED_1}}
- {{PREFERRED_2}}

---

## What We Offer

- {{BENEFIT_1}}
- {{BENEFIT_2}}
- {{BENEFIT_3}}

---

## How to Apply

{{APPLICATION_INSTRUCTIONS}}

*{{COMPANY}} is an equal opportunity employer.*
""",
    },
    {
        "id": "offer-letter",
        "title": "Offer Letter",
        "profiles": ["hr"],
        "keywords": ["offer letter", "employment offer", "job offer", "salary", "start date", "hire"],
        "use_cases": ["Write an offer letter", "Send a job offer", "Draft employment offer"],
        "content": """\
{{DATE}}

{{CANDIDATE_NAME}}
{{CANDIDATE_ADDRESS}}

Dear {{CANDIDATE_FIRST_NAME}},

## Offer of Employment — {{JOB_TITLE}}

We are delighted to offer you the position of **{{JOB_TITLE}}** at **{{COMPANY}}**, reporting to **{{MANAGER}}** in the **{{DEPARTMENT}}** team.

---

## Terms

| Term | Detail |
| --- | --- |
| Start date | {{START_DATE}} |
| Employment type | {{TYPE}} |
| Location | {{LOCATION}} |
| Base salary | {{SALARY}} per {{PERIOD}} |
| Bonus / commission | {{BONUS}} |
| Probation period | {{PROBATION}} |
| Annual leave | {{LEAVE}} days per year |

---

## Benefits

{{BENEFITS_SUMMARY}}

---

## Conditions

This offer is conditional upon:
- Satisfactory references from {{REFERENCE_COUNT}} referees
- {{CONDITION_2}}
- {{CONDITION_3}}

---

## Acceptance

Please confirm your acceptance by signing and returning this letter by **{{ACCEPTANCE_DEADLINE}}**.

We look forward to welcoming you to the team.

Yours sincerely,

{{SIGNATORY_NAME}}
{{SIGNATORY_TITLE}}
{{COMPANY}}

---

**I, {{CANDIDATE_NAME}}, accept the offer of employment on the terms stated above.**

Signature: _______________ Date: _______________
""",
    },
    {
        "id": "performance-review",
        "title": "Performance Review",
        "profiles": ["hr", "project-manager"],
        "keywords": ["performance review", "appraisal", "evaluation", "feedback", "goals", "rating", "360"],
        "use_cases": ["Write a performance review", "Complete an appraisal", "Give structured feedback"],
        "content": """\
# Performance Review

**Employee:** {{EMPLOYEE_NAME}}
**Role:** {{JOB_TITLE}}
**Department:** {{DEPARTMENT}}
**Reviewer:** {{REVIEWER}}
**Review period:** {{PERIOD}}
**Review date:** {{DATE}}

---

## Overall Rating

**{{OVERALL_RATING}}** — {{RATING_DESCRIPTION}}

*(Rating scale: Exceptional / Exceeds Expectations / Meets Expectations / Needs Improvement / Unsatisfactory)*

---

## Goals Review

| Goal | Target | Achievement | Rating |
| --- | --- | --- | --- |
| {{GOAL_1}} | {{TARGET_1}} | {{ACHIEVED_1}} | {{RATING_1}} |
| {{GOAL_2}} | {{TARGET_2}} | {{ACHIEVED_2}} | {{RATING_2}} |
| {{GOAL_3}} | {{TARGET_3}} | {{ACHIEVED_3}} | {{RATING_3}} |

---

## Strengths

{{STRENGTHS}}

---

## Areas for Development

{{DEVELOPMENT_AREAS}}

---

## Behavioural Competencies

| Competency | Rating | Comments |
| --- | --- | --- |
| Communication | {{COMM_RATING}} | {{COMM_COMMENT}} |
| Teamwork | {{TEAM_RATING}} | {{TEAM_COMMENT}} |
| Leadership | {{LEAD_RATING}} | {{LEAD_COMMENT}} |
| Problem-solving | {{PS_RATING}} | {{PS_COMMENT}} |

---

## Goals for Next Period

1. {{NEXT_GOAL_1}} — by {{NEXT_DUE_1}}
2. {{NEXT_GOAL_2}} — by {{NEXT_DUE_2}}
3. {{NEXT_GOAL_3}} — by {{NEXT_DUE_3}}

---

## Development Plan

{{DEVELOPMENT_PLAN}}

---

## Employee Comments

{{EMPLOYEE_COMMENTS}}

---

## Signatures

| | |
| --- | --- |
| Reviewer: _______________ | Date: _______________ |
| Employee: _______________ | Date: _______________ |
| HR: _______________ | Date: _______________ |
""",
    },
    {
        "id": "onboarding-plan",
        "title": "Onboarding Plan",
        "profiles": ["hr"],
        "keywords": ["onboarding", "new hire", "induction", "first day", "welcome", "orientation", "training"],
        "use_cases": ["Create an onboarding plan", "Write a new hire welcome pack", "Design an induction programme"],
        "content": """\
# Onboarding Plan: {{EMPLOYEE_NAME}}

**Role:** {{JOB_TITLE}}
**Department:** {{DEPARTMENT}}
**Manager:** {{MANAGER}}
**Start date:** {{START_DATE}}
**Buddy:** {{BUDDY}}

---

## Before Day 1

| Task | Owner | Status |
| --- | --- | --- |
| Send welcome email | HR | ☐ |
| Set up accounts (email, Slack, etc.) | IT | ☐ |
| Prepare workstation | Facilities | ☐ |
| {{TASK_1}} | {{OWNER_1}} | ☐ |

---

## Week 1: Orientation

| Day | Focus | Activities |
| --- | --- | --- |
| Day 1 | Welcome & admin | {{DAY1_ACTIVITIES}} |
| Day 2 | Team introductions | {{DAY2_ACTIVITIES}} |
| Day 3 | Role deep-dive | {{DAY3_ACTIVITIES}} |
| Day 4–5 | Tools & processes | {{DAY45_ACTIVITIES}} |

---

## Month 1: Learning

- Complete {{TRAINING_1}} by {{DATE_1}}
- Shadow {{TEAM_MEMBER}} on {{ACTIVITY}}
- First 1:1 with manager: {{DATE_FIRST_1_1}}
- Key meetings to attend: {{KEY_MEETINGS}}

---

## 30 / 60 / 90 Day Goals

| Milestone | Goal | Success Metric |
| --- | --- | --- |
| 30 days | {{GOAL_30}} | {{METRIC_30}} |
| 60 days | {{GOAL_60}} | {{METRIC_60}} |
| 90 days | {{GOAL_90}} | {{METRIC_90}} |

---

## Key Contacts

| Name | Role | Contact |
| --- | --- | --- |
| {{CONTACT_1}} | {{ROLE_1}} | {{EMAIL_1}} |
| {{CONTACT_2}} | {{ROLE_2}} | {{EMAIL_2}} |

---

## Resources

{{RESOURCES}}
""",
    },
    {
        "id": "hr-policy",
        "title": "HR Policy Document",
        "profiles": ["hr"],
        "keywords": ["hr policy", "policy", "procedure", "handbook", "rules", "guidelines", "workplace"],
        "use_cases": ["Write an HR policy", "Create a workplace policy", "Draft company procedures"],
        "content": """\
# {{POLICY_TITLE}}

**Policy number:** {{POLICY_NUMBER}}
**Version:** {{VERSION}}
**Effective date:** {{EFFECTIVE_DATE}}
**Review date:** {{REVIEW_DATE}}
**Owner:** {{OWNER}}
**Approved by:** {{APPROVER}}

---

## 1. Purpose

{{PURPOSE}}

---

## 2. Scope

This policy applies to {{SCOPE}}.

---

## 3. Policy Statement

{{POLICY_STATEMENT}}

---

## 4. Definitions

| Term | Definition |
| --- | --- |
| {{TERM_1}} | {{DEF_1}} |
| {{TERM_2}} | {{DEF_2}} |

---

## 5. Procedure

### 5.1 {{STEP_1_TITLE}}
{{STEP_1}}

### 5.2 {{STEP_2_TITLE}}
{{STEP_2}}

### 5.3 {{STEP_3_TITLE}}
{{STEP_3}}

---

## 6. Responsibilities

| Role | Responsibility |
| --- | --- |
| Employee | {{EMP_RESPONSIBILITY}} |
| Manager | {{MGR_RESPONSIBILITY}} |
| HR | {{HR_RESPONSIBILITY}} |

---

## 7. Non-Compliance

{{NON_COMPLIANCE}}

---

## 8. Related Policies

- {{RELATED_1}}
- {{RELATED_2}}

---

## 9. Document History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| {{VERSION}} | {{DATE}} | {{AUTHOR}} | Initial issue |
""",
    },
    {
        "id": "training-plan",
        "title": "Training Plan",
        "profiles": ["hr", "project-manager", "operations"],
        "keywords": ["training", "learning", "development", "course", "upskill", "programme", "L&D"],
        "use_cases": ["Create a training plan", "Design a learning programme", "Write an L&D plan"],
        "content": """\
# Training Plan: {{PROGRAMME_NAME}}

**Target audience:** {{AUDIENCE}}
**Owner:** {{OWNER}}
**Period:** {{PERIOD}}
**Budget:** {{BUDGET}}

---

## Learning Objectives

By the end of this programme, participants will be able to:
1. {{OBJECTIVE_1}}
2. {{OBJECTIVE_2}}
3. {{OBJECTIVE_3}}

---

## Training Schedule

| Module | Topic | Duration | Format | Date | Facilitator |
| --- | --- | --- | --- | --- | --- |
| 1 | {{TOPIC_1}} | {{DUR_1}} | {{FORMAT_1}} | {{DATE_1}} | {{FAC_1}} |
| 2 | {{TOPIC_2}} | {{DUR_2}} | {{FORMAT_2}} | {{DATE_2}} | {{FAC_2}} |
| 3 | {{TOPIC_3}} | {{DUR_3}} | {{FORMAT_3}} | {{DATE_3}} | {{FAC_3}} |

---

## Resources Required

| Resource | Cost | Provider |
| --- | --- | --- |
| {{RESOURCE_1}} | {{COST_1}} | {{PROVIDER_1}} |
| {{RESOURCE_2}} | {{COST_2}} | {{PROVIDER_2}} |

---

## Assessment & Evaluation

**Assessment method:** {{ASSESSMENT}}
**Pass mark:** {{PASS_MARK}}
**Evaluation:** {{EVALUATION_METHOD}}

---

## Success Metrics

| Metric | Target |
| --- | --- |
| Completion rate | {{COMPLETION_TARGET}} |
| Satisfaction score | {{SATISFACTION_TARGET}} |
| Knowledge gain | {{KNOWLEDGE_TARGET}} |
""",
    },
    # ═══════════════════════════════════════════════════════════════════════════════
    # SALES
    # ═══════════════════════════════════════════════════════════════════════════════
    {
        "id": "pitch-deck-outline",
        "title": "Pitch Deck Outline",
        "profiles": ["sales", "startup"],
        "keywords": ["pitch deck", "slides", "investor", "presentation", "funding", "demo", "pitch"],
        "use_cases": ["Create a pitch deck", "Write investor slides", "Draft a sales presentation"],
        "content": """\
# Pitch Deck: {{COMPANY_OR_PRODUCT}}

**Presenter:** {{PRESENTER}}
**Audience:** {{AUDIENCE}}
**Date:** {{DATE}}

---

## Slide 1 — Title
**{{COMPANY_NAME}}**
*{{TAGLINE}}*

---

## Slide 2 — Problem
{{PROBLEM_STATEMENT}}
- {{PAIN_POINT_1}}
- {{PAIN_POINT_2}}
*Market size / urgency: {{MARKET_URGENCY}}*

---

## Slide 3 — Solution
{{SOLUTION_SUMMARY}}
*Key differentiator: {{DIFFERENTIATOR}}*

---

## Slide 4 — Product / Demo
{{PRODUCT_DESCRIPTION}}
*Screenshots / demo notes: {{DEMO_NOTES}}*

---

## Slide 5 — Market Opportunity
- **TAM:** {{TAM}}
- **SAM:** {{SAM}}
- **SOM:** {{SOM}}

---

## Slide 6 — Business Model
{{BUSINESS_MODEL}}
*Revenue streams: {{REVENUE_STREAMS}}*

---

## Slide 7 — Traction
| Metric | Value |
| --- | --- |
| {{METRIC_1}} | {{VALUE_1}} |
| {{METRIC_2}} | {{VALUE_2}} |

---

## Slide 8 — Go-to-Market
{{GTM_STRATEGY}}

---

## Slide 9 — Competition
| | Us | {{COMP_1}} | {{COMP_2}} |
| --- | --- | --- | --- |
| {{FEATURE_1}} | ✓ | ✗ | ✓ |
| {{FEATURE_2}} | ✓ | ✓ | ✗ |

---

## Slide 10 — Team
{{TEAM_SUMMARY}}

---

## Slide 11 — Financials
{{FINANCIAL_SUMMARY}}

---

## Slide 12 — Ask
**Raising:** {{RAISE_AMOUNT}}
**Use of funds:** {{USE_OF_FUNDS}}
**Contact:** {{CONTACT}}
""",
    },
    {
        "id": "rfp-response",
        "title": "RFP Response",
        "profiles": ["sales", "business-analyst"],
        "keywords": ["rfp", "rfq", "rfi", "tender", "bid", "response", "proposal", "government", "procurement"],
        "use_cases": ["Respond to an RFP", "Write a tender response", "Answer an RFQ"],
        "content": """\
# Response to Request for Proposal

**RFP Reference:** {{RFP_REF}}
**Issued by:** {{ISSUER}}
**Response by:** {{COMPANY}}
**Submission date:** {{DATE}}
**Contact:** {{CONTACT}}

---

## Executive Summary

{{EXECUTIVE_SUMMARY}}

---

## Understanding of Requirements

{{UNDERSTANDING}}

---

## Proposed Solution

### Approach
{{APPROACH}}

### Methodology
{{METHODOLOGY}}

### Deliverables

| Deliverable | Description | Timeline |
| --- | --- | --- |
| {{DEL_1}} | {{DESC_1}} | {{TIME_1}} |
| {{DEL_2}} | {{DESC_2}} | {{TIME_2}} |

---

## Team & Credentials

| Name | Role | Relevant Experience |
| --- | --- | --- |
| {{PERSON_1}} | {{ROLE_1}} | {{EXP_1}} |
| {{PERSON_2}} | {{ROLE_2}} | {{EXP_2}} |

---

## Pricing

| Item | Unit | Qty | Unit Price | Total |
| --- | --- | --- | --- | --- |
| {{ITEM_1}} | {{UNIT_1}} | {{QTY_1}} | {{PRICE_1}} | {{TOTAL_1}} |
| {{ITEM_2}} | {{UNIT_2}} | {{QTY_2}} | {{PRICE_2}} | {{TOTAL_2}} |
| **Grand Total** | | | | **{{GRAND_TOTAL}}** |

---

## References

| Organisation | Contact | Scope |
| --- | --- | --- |
| {{REF_1}} | {{CONTACT_1}} | {{SCOPE_1}} |

---

## Compliance Statement

{{COMPLIANCE_STATEMENT}}

---

## Appendices

{{APPENDICES}}
""",
    },
    {
        "id": "account-plan",
        "title": "Account Plan",
        "profiles": ["sales"],
        "keywords": ["account plan", "client", "customer", "relationship", "growth", "expansion", "upsell"],
        "use_cases": ["Create an account plan", "Plan client growth", "Write a key account strategy"],
        "content": """\
# Account Plan: {{CLIENT_NAME}}

**Account Manager:** {{AM}}
**Period:** {{PERIOD}}
**Date:** {{DATE}}

---

## Account Overview

| Field | Detail |
| --- | --- |
| Industry | {{INDUSTRY}} |
| Revenue (current) | {{CURRENT_REVENUE}} |
| Employees | {{EMPLOYEES}} |
| Key products / services | {{PRODUCTS}} |
| Contract renewal | {{RENEWAL_DATE}} |

---

## Relationship Map

| Contact | Title | Influence | Relationship | Notes |
| --- | --- | --- | --- | --- |
| {{CONTACT_1}} | {{TITLE_1}} | Champion | Strong | {{NOTES_1}} |
| {{CONTACT_2}} | {{TITLE_2}} | Decision maker | Neutral | {{NOTES_2}} |
| {{CONTACT_3}} | {{TITLE_3}} | Blocker | Weak | {{NOTES_3}} |

---

## Client Goals & Challenges

**Strategic goals:** {{CLIENT_GOALS}}
**Key challenges:** {{CHALLENGES}}

---

## Current State

**Products/services in use:** {{CURRENT_PRODUCTS}}
**Satisfaction level:** {{SATISFACTION}} / 10
**Risk of churn:** {{CHURN_RISK}}

---

## Growth Opportunities

| Opportunity | Product / Service | Potential Value | Timeline | Probability |
| --- | --- | --- | --- | --- |
| {{OPP_1}} | {{PROD_1}} | {{VALUE_1}} | {{TIME_1}} | {{PROB_1}}% |
| {{OPP_2}} | {{PROD_2}} | {{VALUE_2}} | {{TIME_2}} | {{PROB_2}}% |

---

## Action Plan

| Action | Owner | Due | Status |
| --- | --- | --- | --- |
| {{ACTION_1}} | {{OWNER_1}} | {{DUE_1}} | Open |
| {{ACTION_2}} | {{OWNER_2}} | {{DUE_2}} | Open |

---

## Revenue Target

**Current ARR:** {{CURRENT_ARR}}
**Target ARR:** {{TARGET_ARR}}
**Growth:** {{GROWTH}}%
""",
    },
    {
        "id": "win-loss-analysis",
        "title": "Win / Loss Analysis",
        "profiles": ["sales", "business-analyst"],
        "keywords": ["win loss", "deal", "competitive", "why won", "why lost", "post-mortem", "deal review"],
        "use_cases": ["Write a win/loss analysis", "Review a lost deal", "Analyse competitive losses"],
        "content": """\
# Win / Loss Analysis: {{DEAL_NAME}}

**Outcome:** {{WIN_OR_LOSS}}
**Account:** {{ACCOUNT}}
**Value:** {{DEAL_VALUE}}
**Close date:** {{CLOSE_DATE}}
**AM:** {{AM}}
**Interviewed by:** {{INTERVIEWER}}

---

## Deal Summary

{{DEAL_SUMMARY}}

---

## Why We {{WIN_OR_LOSS}}

### Primary reason
{{PRIMARY_REASON}}

### Contributing factors

| Factor | Weight | Notes |
| --- | --- | --- |
| {{FACTOR_1}} | High | {{NOTES_1}} |
| {{FACTOR_2}} | Medium | {{NOTES_2}} |
| {{FACTOR_3}} | Low | {{NOTES_3}} |

---

## Competitor / Alternative Chosen

**Selected:** {{COMPETITOR}}
**Why they won (if lost):** {{COMPETITOR_REASON}}

---

## Buyer Feedback

> "{{BUYER_QUOTE_1}}" — {{BUYER_CONTACT}}

> "{{BUYER_QUOTE_2}}"

---

## Our Strengths in This Deal

{{STRENGTHS}}

---

## Our Weaknesses / Gaps

{{WEAKNESSES}}

---

## Lessons Learned

| Lesson | Applies to | Owner | Action |
| --- | --- | --- | --- |
| {{LESSON_1}} | {{APPLIES_1}} | {{OWNER_1}} | {{ACTION_1}} |
| {{LESSON_2}} | {{APPLIES_2}} | {{OWNER_2}} | {{ACTION_2}} |
""",
    },
    # ═══════════════════════════════════════════════════════════════════════════════
    # PROJECT MANAGEMENT
    # ═══════════════════════════════════════════════════════════════════════════════
    {
        "id": "project-plan",
        "title": "Project Plan",
        "profiles": ["project-manager"],
        "keywords": ["project plan", "schedule", "timeline", "milestones", "gantt", "wbs", "tasks", "phases"],
        "use_cases": ["Create a project plan", "Write a project schedule", "Plan project phases"],
        "content": """\
# Project Plan: {{PROJECT_NAME}}

**PM:** {{PM}}  **Sponsor:** {{SPONSOR}}  **Date:** {{DATE}}
**Start:** {{START_DATE}}  **End:** {{END_DATE}}  **Budget:** {{BUDGET}}

---

## Objectives

1. {{OBJECTIVE_1}}
2. {{OBJECTIVE_2}}

---

## Phases & Milestones

| Phase | Milestone | Start | End | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| 1. {{PHASE_1}} | {{MILESTONE_1}} | {{S_1}} | {{E_1}} | {{OWN_1}} | Not started |
| 2. {{PHASE_2}} | {{MILESTONE_2}} | {{S_2}} | {{E_2}} | {{OWN_2}} | Not started |
| 3. {{PHASE_3}} | {{MILESTONE_3}} | {{S_3}} | {{E_3}} | {{OWN_3}} | Not started |

---

## Task Breakdown

| ID | Task | Phase | Owner | Effort | Start | End | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T-01 | {{TASK_1}} | 1 | {{OWN_1}} | {{EFF_1}} | {{S_1}} | {{E_1}} | — |
| T-02 | {{TASK_2}} | 1 | {{OWN_2}} | {{EFF_2}} | {{S_2}} | {{E_2}} | T-01 |

---

## Resources

| Name | Role | Allocation | Cost |
| --- | --- | --- | --- |
| {{RES_1}} | {{ROLE_1}} | {{ALLOC_1}} | {{COST_1}} |

---

## Budget

| Category | Planned | Actual | Variance |
| --- | --- | --- | --- |
| {{CAT_1}} | {{PLAN_1}} | — | — |
| **Total** | **{{TOTAL_BUDGET}}** | | |

---

## Key Risks

| Risk | Mitigation |
| --- | --- |
| {{RISK_1}} | {{MIT_1}} |

---

## Assumptions & Constraints

**Assumptions:** {{ASSUMPTIONS}}
**Constraints:** {{CONSTRAINTS}}
""",
    },
    {
        "id": "risk-register",
        "title": "Risk Register",
        "profiles": ["project-manager", "business-analyst", "operations"],
        "keywords": ["risk register", "risks", "issues", "mitigation", "log", "tracker", "project risk"],
        "use_cases": ["Create a risk register", "Maintain a risk log", "Track project risks"],
        "content": """\
# Risk Register: {{PROJECT_NAME}}

**PM:** {{PM}}  **Last updated:** {{DATE}}

---

## Active Risks

| ID | Risk | Category | Probability | Impact | Score | Owner | Response | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | {{RISK_1}} | {{CAT_1}} | H | H | 9 | {{OWN_1}} | Mitigate | Open |
| R-02 | {{RISK_2}} | {{CAT_2}} | M | H | 6 | {{OWN_2}} | Mitigate | Open |
| R-03 | {{RISK_3}} | {{CAT_3}} | L | M | 2 | {{OWN_3}} | Accept | Monitoring |

*(Score = Probability × Impact, scale 1–3 each)*

---

## Risk Detail

### R-01: {{RISK_1}}

**Trigger:** {{TRIGGER_1}}
**Consequence:** {{CONSEQUENCE_1}}
**Mitigation actions:**
- {{MIT_ACTION_1}} — {{MIT_OWNER_1}} by {{MIT_DUE_1}}
**Contingency:** {{CONTINGENCY_1}}
**Residual risk:** {{RESIDUAL_1}}

---

## Issues Log

| ID | Issue | Raised | Owner | Priority | Resolution | Status |
| --- | --- | --- | --- | --- | --- | --- |
| I-01 | {{ISSUE_1}} | {{DATE_1}} | {{OWN_1}} | High | {{RES_1}} | Open |

---

## Closed Risks

| ID | Risk | Closed Date | Outcome |
| --- | --- | --- | --- |
| R-00 | {{CLOSED_RISK}} | {{CLOSED_DATE}} | Avoided |
""",
    },
    {
        "id": "retrospective",
        "title": "Retrospective Report",
        "profiles": ["project-manager"],
        "keywords": ["retrospective", "retro", "lessons learned", "sprint", "agile", "review", "what went well"],
        "use_cases": ["Write a project retrospective", "Run a sprint retro", "Document lessons learned"],
        "content": """\
# Retrospective: {{SPRINT_OR_PROJECT}}

**Team:** {{TEAM}}
**Facilitator:** {{FACILITATOR}}
**Date:** {{DATE}}
**Period covered:** {{PERIOD}}

---

## What Went Well 🟢

- {{GOOD_1}}
- {{GOOD_2}}
- {{GOOD_3}}

---

## What Didn't Go Well 🔴

- {{BAD_1}}
- {{BAD_2}}
- {{BAD_3}}

---

## What to Improve 🟡

| Issue | Root Cause | Proposed Action | Owner | Due |
| --- | --- | --- | --- | --- |
| {{ISSUE_1}} | {{CAUSE_1}} | {{ACTION_1}} | {{OWNER_1}} | {{DUE_1}} |
| {{ISSUE_2}} | {{CAUSE_2}} | {{ACTION_2}} | {{OWNER_2}} | {{DUE_2}} |

---

## Shout-outs 🏆

{{SHOUTOUTS}}

---

## Action Items from Last Retro

| Action | Owner | Status |
| --- | --- | --- |
| {{PREV_ACTION_1}} | {{PREV_OWN_1}} | ✅ Done |
| {{PREV_ACTION_2}} | {{PREV_OWN_2}} | 🔄 In progress |

---

## Team Mood

**Happiness score:** {{MOOD}}/10

{{MOOD_COMMENTS}}
""",
    },
    {
        "id": "project-closure",
        "title": "Project Closure Report",
        "profiles": ["project-manager"],
        "keywords": ["project closure", "close out", "completion", "handover", "lessons learned", "final report"],
        "use_cases": ["Write a project closure report", "Close out a project", "Document project completion"],
        "content": """\
# Project Closure Report: {{PROJECT_NAME}}

**PM:** {{PM}}  **Sponsor:** {{SPONSOR}}
**Original end date:** {{PLANNED_END}}
**Actual end date:** {{ACTUAL_END}}
**Report date:** {{DATE}}

---

## Project Summary

{{PROJECT_SUMMARY}}

---

## Objectives Achievement

| Objective | Achieved? | Notes |
| --- | --- | --- |
| {{OBJ_1}} | ✅ Yes | {{NOTES_1}} |
| {{OBJ_2}} | ⚠️ Partial | {{NOTES_2}} |
| {{OBJ_3}} | ❌ No | {{NOTES_3}} |

---

## Schedule Performance

| Milestone | Planned | Actual | Variance |
| --- | --- | --- | --- |
| {{MS_1}} | {{PLAN_1}} | {{ACT_1}} | {{VAR_1}} |
| {{MS_2}} | {{PLAN_2}} | {{ACT_2}} | {{VAR_2}} |

---

## Budget Performance

| Category | Planned | Actual | Variance |
| --- | --- | --- | --- |
| {{CAT_1}} | {{PLAN_1}} | {{ACT_1}} | {{VAR_1}} |
| **Total** | **{{TOTAL_PLANNED}}** | **{{TOTAL_ACTUAL}}** | **{{TOTAL_VAR}}** |

---

## Deliverables Handover

| Deliverable | Recipient | Handover Date | Sign-off |
| --- | --- | --- | --- |
| {{DEL_1}} | {{REC_1}} | {{DATE_1}} | ___________ |
| {{DEL_2}} | {{REC_2}} | {{DATE_2}} | ___________ |

---

## Lessons Learned

| Category | Lesson | Recommendation |
| --- | --- | --- |
| Planning | {{LESSON_1}} | {{REC_1}} |
| Execution | {{LESSON_2}} | {{REC_2}} |
| Stakeholders | {{LESSON_3}} | {{REC_3}} |

---

## Outstanding Items

{{OUTSTANDING}}

---

## Sign-off

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| PM | {{PM}} | | |
| Sponsor | {{SPONSOR}} | | |
""",
    },
    # ═══════════════════════════════════════════════════════════════════════════════
    # FINANCE
    # ═══════════════════════════════════════════════════════════════════════════════
    {
        "id": "financial-summary",
        "title": "Financial Summary Report",
        "profiles": ["finance"],
        "keywords": ["financial summary", "finance report", "quarterly", "monthly", "results", "revenue", "profit"],
        "use_cases": ["Write a financial summary", "Create a monthly finance report", "Summarise quarterly results"],
        "content": """\
# Financial Summary Report — {{PERIOD}}

**Prepared by:** {{AUTHOR}}
**Date:** {{DATE}}
**Audience:** {{AUDIENCE}}

---

## Headline Numbers

| Metric | Actual | Budget | Variance | Prior Period |
| --- | --- | --- | --- | --- |
| Revenue | {{REV_ACT}} | {{REV_BUD}} | {{REV_VAR}} | {{REV_PRIOR}} |
| Gross Profit | {{GP_ACT}} | {{GP_BUD}} | {{GP_VAR}} | {{GP_PRIOR}} |
| Operating Expenses | {{OPEX_ACT}} | {{OPEX_BUD}} | {{OPEX_VAR}} | {{OPEX_PRIOR}} |
| EBITDA | {{EBITDA_ACT}} | {{EBITDA_BUD}} | {{EBITDA_VAR}} | {{EBITDA_PRIOR}} |
| Net Profit | {{NP_ACT}} | {{NP_BUD}} | {{NP_VAR}} | {{NP_PRIOR}} |

---

## Revenue by Segment

| Segment | Revenue | % of Total | vs Budget |
| --- | --- | --- | --- |
| {{SEG_1}} | {{SEG_REV_1}} | {{SEG_PCT_1}} | {{SEG_VAR_1}} |
| {{SEG_2}} | {{SEG_REV_2}} | {{SEG_PCT_2}} | {{SEG_VAR_2}} |

---

## Key Variances

{{KEY_VARIANCES}}

---

## Cash Position

**Opening cash:** {{OPEN_CASH}}
**Net cash flow:** {{NET_FLOW}}
**Closing cash:** {{CLOSE_CASH}}
**Cash runway:** {{RUNWAY}}

---

## Outlook

{{OUTLOOK}}

---

## Key Risks

{{RISKS}}
""",
    },
    {
        "id": "expense-report",
        "title": "Expense Report",
        "profiles": ["finance", "hr"],
        "keywords": ["expense report", "expenses", "reimbursement", "travel", "receipts", "claims"],
        "use_cases": ["Submit an expense report", "Claim business expenses", "Create expense summary"],
        "content": """\
# Expense Report

**Employee:** {{EMPLOYEE_NAME}}
**Department:** {{DEPARTMENT}}
**Period:** {{PERIOD}}
**Submitted:** {{DATE}}
**Approved by:** {{APPROVER}}

---

## Expense Summary

| Date | Category | Description | Amount | Receipt |
| --- | --- | --- | --- | --- |
| {{DATE_1}} | {{CAT_1}} | {{DESC_1}} | {{AMT_1}} | ✓ |
| {{DATE_2}} | {{CAT_2}} | {{DESC_2}} | {{AMT_2}} | ✓ |
| {{DATE_3}} | {{CAT_3}} | {{DESC_3}} | {{AMT_3}} | ✓ |

---

## Totals by Category

| Category | Total |
| --- | --- |
| Travel | {{TRAVEL_TOTAL}} |
| Accommodation | {{ACCOMM_TOTAL}} |
| Meals | {{MEALS_TOTAL}} |
| Other | {{OTHER_TOTAL}} |
| **Grand Total** | **{{GRAND_TOTAL}}** |

---

## Business Purpose

{{BUSINESS_PURPOSE}}

---

## Reimbursement Details

**Preferred payment:** {{PAYMENT_METHOD}}
**Bank / account:** {{BANK_DETAILS}}

---

## Declaration

I confirm these expenses were incurred for legitimate business purposes.

**Signature:** _______________ **Date:** _______________

---

*Approved by:* _______________ *Date:* _______________
""",
    },
    {
        "id": "board-financial-report",
        "title": "Board Financial Report",
        "profiles": ["finance", "startup"],
        "keywords": ["board report", "board pack", "directors", "governance", "financial update", "investor update"],
        "use_cases": ["Write a board financial report", "Create a board pack", "Prepare investor financials"],
        "content": """\
# Board Financial Report — {{PERIOD}}

**Prepared by:** CFO / Finance
**Date:** {{DATE}}
**Board meeting:** {{BOARD_DATE}}
**Confidential**

---

## 1. Summary

{{SUMMARY}}

---

## 2. Financial Highlights

| KPI | Actual | Target | Trend |
| --- | --- | --- | --- |
| Revenue | {{REV}} | {{REV_TARGET}} | ↑ |
| ARR / MRR | {{ARR}} | {{ARR_TARGET}} | ↑ |
| Gross margin | {{GM}}% | {{GM_TARGET}}% | → |
| Burn rate | {{BURN}}/mo | {{BURN_TARGET}} | ↓ |
| Runway | {{RUNWAY}} months | > 18 months | |

---

## 3. Income Statement (YTD)

| | YTD Actual | YTD Budget | Full Year Forecast |
| --- | --- | --- | --- |
| Revenue | {{REV_YTD}} | {{REV_BUD_YTD}} | {{REV_FY}} |
| COGS | {{COGS_YTD}} | {{COGS_BUD_YTD}} | {{COGS_FY}} |
| Gross Profit | {{GP_YTD}} | {{GP_BUD_YTD}} | {{GP_FY}} |
| Operating Expenses | {{OPEX_YTD}} | {{OPEX_BUD_YTD}} | {{OPEX_FY}} |
| EBITDA | {{EBITDA_YTD}} | {{EBITDA_BUD_YTD}} | {{EBITDA_FY}} |

---

## 4. Cash Flow

{{CASH_FLOW_NARRATIVE}}

**Closing cash:** {{CLOSING_CASH}}
**Runway:** {{RUNWAY}} months

---

## 5. Key Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| {{RISK_1}} | {{IMPACT_1}} | {{MIT_1}} |

---

## 6. Recommendations

{{RECOMMENDATIONS}}

---

## 7. Appendices

{{APPENDICES}}
""",
    },
    # ═══════════════════════════════════════════════════════════════════════════════
    # RESEARCH / ACADEMIC
    # ═══════════════════════════════════════════════════════════════════════════════
    {
        "id": "literature-review",
        "title": "Literature Review",
        "profiles": ["researcher"],
        "keywords": [
            "literature review",
            "research",
            "academic",
            "papers",
            "sources",
            "bibliography",
            "systematic review",
        ],
        "use_cases": ["Write a literature review", "Summarise research papers", "Create a systematic review"],
        "content": """\
# Literature Review: {{TOPIC}}

**Author:** {{AUTHOR}}
**Institution:** {{INSTITUTION}}
**Date:** {{DATE}}
**Scope:** {{SCOPE}} (years: {{YEAR_RANGE}}, databases: {{DATABASES}})

---

## Abstract

{{ABSTRACT}}

---

## 1. Introduction

{{INTRODUCTION}}

**Research questions:**
1. {{RQ_1}}
2. {{RQ_2}}

---

## 2. Search Strategy

**Keywords:** {{KEYWORDS}}
**Inclusion criteria:** {{INCLUSION}}
**Exclusion criteria:** {{EXCLUSION}}
**Total papers reviewed:** {{TOTAL_PAPERS}}
**Papers included:** {{INCLUDED_PAPERS}}

---

## 3. Thematic Analysis

### Theme 1: {{THEME_1}}

{{THEME_1_DISCUSSION}}

*Key sources: {{THEME_1_SOURCES}}*

### Theme 2: {{THEME_2}}

{{THEME_2_DISCUSSION}}

### Theme 3: {{THEME_3}}

{{THEME_3_DISCUSSION}}

---

## 4. Synthesis & Discussion

{{SYNTHESIS}}

---

## 5. Gaps in the Literature

{{GAPS}}

---

## 6. Conclusions

{{CONCLUSIONS}}

---

## References

{{REFERENCES}}
""",
    },
    {
        "id": "abstract",
        "title": "Abstract",
        "profiles": ["researcher"],
        "keywords": ["abstract", "summary", "paper", "research", "academic", "journal", "conference"],
        "use_cases": ["Write an abstract", "Summarise a paper", "Create a research abstract"],
        "content": """\
# Abstract: {{PAPER_TITLE}}

**Authors:** {{AUTHORS}}
**Institution:** {{INSTITUTION}}
**Conference / Journal:** {{VENUE}}
**Keywords:** {{KEYWORDS}}

---

## Abstract

**Background:** {{BACKGROUND}}

**Objective:** {{OBJECTIVE}}

**Methods:** {{METHODS}}

**Results:** {{RESULTS}}

**Conclusions:** {{CONCLUSIONS}}

**Keywords:** {{KEYWORDS}}

---

*Word count: {{WORD_COUNT}} / {{MAX_WORDS}}*
""",
    },
    {
        "id": "grant-application",
        "title": "Grant Application",
        "profiles": ["researcher"],
        "keywords": ["grant", "funding", "research grant", "application", "proposal", "award", "funder"],
        "use_cases": ["Write a grant application", "Apply for research funding", "Submit a grant proposal"],
        "content": """\
# Grant Application: {{PROJECT_TITLE}}

**Applicant:** {{APPLICANT}}
**Institution:** {{INSTITUTION}}
**Funder:** {{FUNDER}}
**Grant programme:** {{PROGRAMME}}
**Amount requested:** {{AMOUNT}}
**Project duration:** {{DURATION}}
**Submission date:** {{DATE}}

---

## Lay Summary (max 150 words)

{{LAY_SUMMARY}}

---

## Research Objectives

1. {{OBJECTIVE_1}}
2. {{OBJECTIVE_2}}
3. {{OBJECTIVE_3}}

---

## Background & Rationale

{{BACKGROUND}}

---

## Research Plan

### Phase 1: {{PHASE_1}} ({{PHASE_1_DURATION}})
{{PHASE_1_DETAIL}}

### Phase 2: {{PHASE_2}} ({{PHASE_2_DURATION}})
{{PHASE_2_DETAIL}}

### Phase 3: {{PHASE_3}} ({{PHASE_3_DURATION}})
{{PHASE_3_DETAIL}}

---

## Team & Expertise

| Name | Role | Institution | Expertise |
| --- | --- | --- | --- |
| {{NAME_1}} | PI | {{INST_1}} | {{EXP_1}} |
| {{NAME_2}} | Co-I | {{INST_2}} | {{EXP_2}} |

---

## Budget

| Item | Year 1 | Year 2 | Year 3 | Total |
| --- | --- | --- | --- | --- |
| Personnel | {{P_1}} | {{P_2}} | {{P_3}} | {{P_T}} |
| Equipment | {{E_1}} | {{E_2}} | {{E_3}} | {{E_T}} |
| Travel | {{T_1}} | {{T_2}} | {{T_3}} | {{T_T}} |
| **Total** | **{{TOT_1}}** | **{{TOT_2}}** | **{{TOT_3}}** | **{{GRAND}}** |

---

## Expected Impact

{{IMPACT}}

---

## Ethical Considerations

{{ETHICS}}
""",
    },
    {
        "id": "data-analysis-summary",
        "title": "Data Analysis Summary",
        "profiles": ["researcher", "business-analyst", "finance"],
        "keywords": ["data analysis", "statistics", "findings", "dataset", "insights", "methodology", "results"],
        "use_cases": ["Write a data analysis summary", "Document statistical findings", "Present data insights"],
        "content": """\
# Data Analysis Summary: {{ANALYSIS_TITLE}}

**Analyst:** {{AUTHOR}}
**Dataset:** {{DATASET}}
**Period / source:** {{SOURCE}}
**Date:** {{DATE}}

---

## Objective

{{OBJECTIVE}}

---

## Dataset Overview

| Property | Value |
| --- | --- |
| Records | {{RECORD_COUNT}} |
| Variables | {{VARIABLE_COUNT}} |
| Date range | {{DATE_RANGE}} |
| Missing data | {{MISSING_PCT}}% |

---

## Methodology

**Approach:** {{METHODOLOGY}}
**Tools used:** {{TOOLS}}
**Statistical tests:** {{TESTS}}

---

## Key Findings

### Finding 1: {{FINDING_1}}
{{FINDING_1_DETAIL}}
*Statistical significance: {{SIG_1}}*

### Finding 2: {{FINDING_2}}
{{FINDING_2_DETAIL}}

### Finding 3: {{FINDING_3}}
{{FINDING_3_DETAIL}}

---

## Summary Statistics

| Variable | Mean | Median | Std Dev | Min | Max |
| --- | --- | --- | --- | --- | --- |
| {{VAR_1}} | {{MEAN_1}} | {{MED_1}} | {{SD_1}} | {{MIN_1}} | {{MAX_1}} |
| {{VAR_2}} | {{MEAN_2}} | {{MED_2}} | {{SD_2}} | {{MIN_2}} | {{MAX_2}} |

---

## Limitations

{{LIMITATIONS}}

---

## Recommendations

{{RECOMMENDATIONS}}

---

## Appendix: Data Dictionary

| Column | Type | Description |
| --- | --- | --- |
| {{COL_1}} | {{TYPE_1}} | {{DESC_1}} |
""",
    },
    # ═══════════════════════════════════════════════════════════════════════════════
    # STARTUP
    # ═══════════════════════════════════════════════════════════════════════════════
    {
        "id": "one-pager",
        "title": "One-Pager / Company Overview",
        "profiles": ["startup", "sales", "marketing"],
        "keywords": ["one pager", "overview", "company overview", "fact sheet", "teaser", "summary", "investor"],
        "use_cases": ["Create a one-pager", "Write a company overview", "Draft an investor teaser"],
        "content": """\
# {{COMPANY_NAME}}

*{{TAGLINE}}*

---

## The Problem

{{PROBLEM}}

## Our Solution

{{SOLUTION}}

## How It Works

1. {{STEP_1}}
2. {{STEP_2}}
3. {{STEP_3}}

---

## Traction

| Metric | Value |
| --- | --- |
| {{METRIC_1}} | {{VALUE_1}} |
| {{METRIC_2}} | {{VALUE_2}} |
| {{METRIC_3}} | {{VALUE_3}} |

---

## Market Opportunity

**TAM:** {{TAM}}  **SAM:** {{SAM}}  **SOM:** {{SOM}}

---

## Business Model

{{BUSINESS_MODEL}}

---

## Team

| Name | Role | Background |
| --- | --- | --- |
| {{FOUNDER_1}} | {{ROLE_1}} | {{BG_1}} |
| {{FOUNDER_2}} | {{ROLE_2}} | {{BG_2}} |

---

## What We're Looking For

{{ASK}}

---

**Contact:** {{CONTACT}}  |  {{EMAIL}}  |  {{WEBSITE}}
""",
    },
    {
        "id": "business-plan",
        "title": "Business Plan",
        "profiles": ["startup", "business-analyst"],
        "keywords": ["business plan", "strategy", "model", "financials", "market", "operations", "planning"],
        "use_cases": ["Write a business plan", "Create a company strategy", "Draft a business model"],
        "content": """\
# Business Plan: {{COMPANY_NAME}}

**Date:** {{DATE}}
**Version:** {{VERSION}}
**Confidential**

---

## Executive Summary

{{EXECUTIVE_SUMMARY}}

---

## 1. Company Overview

**Mission:** {{MISSION}}
**Vision:** {{VISION}}
**Founded:** {{FOUNDED}}
**Stage:** {{STAGE}}
**Location:** {{LOCATION}}

---

## 2. Problem & Solution

**Problem:** {{PROBLEM}}
**Solution:** {{SOLUTION}}
**Unique value proposition:** {{UVP}}

---

## 3. Market Analysis

**Industry:** {{INDUSTRY}}
**TAM:** {{TAM}}
**SAM:** {{SAM}}
**Target segment:** {{TARGET}}

**Key trends:**
- {{TREND_1}}
- {{TREND_2}}

---

## 4. Products & Services

{{PRODUCTS}}

**Roadmap:**
- Q{{Q1}}: {{ROADMAP_1}}
- Q{{Q2}}: {{ROADMAP_2}}
- Q{{Q3}}: {{ROADMAP_3}}

---

## 5. Business Model

{{BUSINESS_MODEL}}

| Revenue Stream | Model | Pricing |
| --- | --- | --- |
| {{STREAM_1}} | {{MODEL_1}} | {{PRICE_1}} |
| {{STREAM_2}} | {{MODEL_2}} | {{PRICE_2}} |

---

## 6. Go-to-Market

{{GTM}}

---

## 7. Operations

**Team size:** {{TEAM_SIZE}}
**Key hires needed:** {{KEY_HIRES}}
**Technology stack:** {{TECH_STACK}}
**Key partners:** {{PARTNERS}}

---

## 8. Financial Projections

| | Year 1 | Year 2 | Year 3 |
| --- | --- | --- | --- |
| Revenue | {{REV_1}} | {{REV_2}} | {{REV_3}} |
| Gross margin | {{GM_1}}% | {{GM_2}}% | {{GM_3}}% |
| EBITDA | {{EBITDA_1}} | {{EBITDA_2}} | {{EBITDA_3}} |

---

## 9. Funding

**Amount raising:** {{RAISE}}
**Use of funds:**
- {{USE_1}}: {{PCT_1}}%
- {{USE_2}}: {{PCT_2}}%

**Previous funding:** {{PREV_FUNDING}}
""",
    },
    {
        "id": "product-roadmap",
        "title": "Product Roadmap",
        "profiles": ["startup", "project-manager", "business-analyst"],
        "keywords": ["roadmap", "product", "features", "timeline", "release", "sprint", "backlog", "milestones"],
        "use_cases": ["Write a product roadmap", "Plan feature releases", "Create a development roadmap"],
        "content": """\
# Product Roadmap: {{PRODUCT_NAME}}

**Owner:** {{OWNER}}
**Last updated:** {{DATE}}
**Horizon:** {{HORIZON}}

---

## Vision & Strategy

**Product vision:** {{VISION}}
**Strategic goals:**
- {{GOAL_1}}
- {{GOAL_2}}
- {{GOAL_3}}

---

## Now ({{NOW_PERIOD}})

| Feature | Description | Team | Status |
| --- | --- | --- | --- |
| {{FEAT_1}} | {{DESC_1}} | {{TEAM_1}} | 🔨 In progress |
| {{FEAT_2}} | {{DESC_2}} | {{TEAM_2}} | 🔨 In progress |
| {{FEAT_3}} | {{DESC_3}} | {{TEAM_3}} | 🔜 Up next |

---

## Next ({{NEXT_PERIOD}})

| Feature | Description | Priority | Dependencies |
| --- | --- | --- | --- |
| {{FEAT_4}} | {{DESC_4}} | High | {{DEP_4}} |
| {{FEAT_5}} | {{DESC_5}} | High | {{DEP_5}} |
| {{FEAT_6}} | {{DESC_6}} | Medium | {{DEP_6}} |

---

## Later ({{LATER_PERIOD}})

| Feature | Rationale | Notes |
| --- | --- | --- |
| {{FEAT_7}} | {{RAT_7}} | {{NOTES_7}} |
| {{FEAT_8}} | {{RAT_8}} | {{NOTES_8}} |

---

## Shipped ✅

| Feature | Release | Impact |
| --- | --- | --- |
| {{SHIPPED_1}} | {{REL_1}} | {{IMPACT_1}} |

---

## Not Doing / Parking Lot

| Item | Reason |
| --- | --- |
| {{PARK_1}} | {{REASON_1}} |
""",
    },
    {
        "id": "okr-document",
        "title": "OKR Document",
        "profiles": ["startup", "operations", "project-manager"],
        "keywords": ["okr", "objectives", "key results", "goals", "quarterly", "planning", "strategy"],
        "use_cases": ["Write OKRs", "Set quarterly goals", "Create an OKR document"],
        "content": """\
# OKRs — {{PERIOD}}

**Team / Company:** {{TEAM}}
**Owner:** {{OWNER}}
**Date set:** {{DATE}}
**Review date:** {{REVIEW_DATE}}

---

## Objective 1: {{OBJECTIVE_1}}

*{{OBJECTIVE_1_WHY}}*

| Key Result | Baseline | Target | Current | Status |
| --- | --- | --- | --- | --- |
| {{KR_1_1}} | {{BASE_1_1}} | {{TARGET_1_1}} | — | 🔜 Not started |
| {{KR_1_2}} | {{BASE_1_2}} | {{TARGET_1_2}} | — | 🔜 Not started |
| {{KR_1_3}} | {{BASE_1_3}} | {{TARGET_1_3}} | — | 🔜 Not started |

---

## Objective 2: {{OBJECTIVE_2}}

*{{OBJECTIVE_2_WHY}}*

| Key Result | Baseline | Target | Current | Status |
| --- | --- | --- | --- | --- |
| {{KR_2_1}} | {{BASE_2_1}} | {{TARGET_2_1}} | — | 🔜 Not started |
| {{KR_2_2}} | {{BASE_2_2}} | {{TARGET_2_2}} | — | 🔜 Not started |

---

## Objective 3: {{OBJECTIVE_3}}

| Key Result | Baseline | Target | Current | Status |
| --- | --- | --- | --- | --- |
| {{KR_3_1}} | {{BASE_3_1}} | {{TARGET_3_1}} | — | 🔜 Not started |
| {{KR_3_2}} | {{BASE_3_2}} | {{TARGET_3_2}} | — | 🔜 Not started |

---

## Dependencies & Blockers

{{DEPENDENCIES}}

---

## Mid-Quarter Check-In

*(Complete at halfway point)*

**Progress summary:** {{MID_SUMMARY}}
**At-risk KRs:** {{AT_RISK}}
**Actions needed:** {{ACTIONS}}
""",
    },
    {
        "id": "investor-update",
        "title": "Investor Update",
        "profiles": ["startup", "finance"],
        "keywords": ["investor update", "investor letter", "startup update", "board update", "fundraising", "progress"],
        "use_cases": ["Write an investor update", "Send a monthly investor letter", "Create a board update"],
        "content": """\
# Investor Update — {{MONTH_YEAR}}

**From:** {{FOUNDER_NAME}}, {{COMPANY}}
**Date:** {{DATE}}

Hi {{INVESTOR_NAMES}},

{{OPENING_PARAGRAPH}}

---

## Highlights

- {{HIGHLIGHT_1}}
- {{HIGHLIGHT_2}}
- {{HIGHLIGHT_3}}

---

## Key Metrics

| Metric | {{PREV_PERIOD}} | {{CURR_PERIOD}} | Change |
| --- | --- | --- | --- |
| {{METRIC_1}} | {{PREV_1}} | {{CURR_1}} | {{CHANGE_1}} |
| {{METRIC_2}} | {{PREV_2}} | {{CURR_2}} | {{CHANGE_2}} |
| {{METRIC_3}} | {{PREV_3}} | {{CURR_3}} | {{CHANGE_3}} |

---

## Product Update

{{PRODUCT_UPDATE}}

---

## Commercial Update

{{COMMERCIAL_UPDATE}}

---

## Team

{{TEAM_UPDATE}}

---

## Financials

**Cash position:** {{CASH}}
**Burn rate:** {{BURN}}/month
**Runway:** {{RUNWAY}} months

---

## Challenges

{{CHALLENGES}}

---

## Ask

{{ASK}}

---

Thanks for your continued support.

{{FOUNDER_NAME}}
{{CONTACT}}
""",
    },
    # ═══════════════════════════════════════════════════════════════════════════════
    # OPERATIONS
    # ═══════════════════════════════════════════════════════════════════════════════
    {
        "id": "sop",
        "title": "Standard Operating Procedure (SOP)",
        "profiles": ["operations", "hr", "legal"],
        "keywords": [
            "sop",
            "standard operating procedure",
            "process",
            "procedure",
            "operations",
            "workflow",
            "instructions",
        ],
        "use_cases": ["Write an SOP", "Document a process", "Create operating procedures"],
        "content": """\
# Standard Operating Procedure: {{PROCESS_NAME}}

**SOP Number:** {{SOP_NUMBER}}
**Version:** {{VERSION}}
**Effective:** {{EFFECTIVE_DATE}}
**Review date:** {{REVIEW_DATE}}
**Owner:** {{OWNER}}
**Approved by:** {{APPROVER}}
**Department:** {{DEPARTMENT}}

---

## 1. Purpose

{{PURPOSE}}

---

## 2. Scope

This SOP applies to {{SCOPE}}. It does not apply to {{OUT_OF_SCOPE}}.

---

## 3. Responsibilities

| Role | Responsibility |
| --- | --- |
| {{ROLE_1}} | {{RESP_1}} |
| {{ROLE_2}} | {{RESP_2}} |
| {{ROLE_3}} | {{RESP_3}} |

---

## 4. Materials & Tools Required

- {{MATERIAL_1}}
- {{MATERIAL_2}}
- {{TOOL_1}}

---

## 5. Procedure

### Step 1: {{STEP_1_TITLE}}
**Who:** {{WHO_1}}
**When:** {{WHEN_1}}

{{STEP_1_DETAIL}}

⚠️ **Important:** {{STEP_1_WARNING}}

### Step 2: {{STEP_2_TITLE}}
**Who:** {{WHO_2}}

{{STEP_2_DETAIL}}

### Step 3: {{STEP_3_TITLE}}

{{STEP_3_DETAIL}}

### Step 4: {{STEP_4_TITLE}}

{{STEP_4_DETAIL}}

---

## 6. Quality Checks

| Check | Method | Frequency | Responsible |
| --- | --- | --- | --- |
| {{CHECK_1}} | {{METHOD_1}} | {{FREQ_1}} | {{RESP_1}} |
| {{CHECK_2}} | {{METHOD_2}} | {{FREQ_2}} | {{RESP_2}} |

---

## 7. Non-Conformance

If the process cannot be completed as described: {{NON_CONFORMANCE_ACTION}}

---

## 8. Records

{{RECORDS}}

---

## 9. Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | {{DATE}} | {{AUTHOR}} | Initial issue |
""",
    },
    {
        "id": "post-mortem",
        "title": "Post-Mortem / Incident Analysis",
        "profiles": ["operations", "project-manager"],
        "keywords": ["post mortem", "incident", "outage", "failure", "root cause", "RCA", "five whys", "blameless"],
        "use_cases": ["Write a post-mortem", "Analyse a system outage", "Document a production incident"],
        "content": """\
# Post-Mortem: {{INCIDENT_TITLE}}

**Severity:** {{SEVERITY}}
**Date of incident:** {{INCIDENT_DATE}}
**Duration:** {{DURATION}}
**Author:** {{AUTHOR}}
**Report date:** {{REPORT_DATE}}
**Status:** Draft / Final

---

## Summary

{{SUMMARY}}

---

## Impact

- **Users affected:** {{USERS_AFFECTED}}
- **Services impacted:** {{SERVICES}}
- **Revenue impact:** {{REVENUE_IMPACT}}
- **Data loss:** {{DATA_LOSS}}

---

## Timeline

| Time (UTC) | Event |
| --- | --- |
| {{TIME_1}} | {{EVENT_1}} |
| {{TIME_2}} | {{EVENT_2}} — incident detected |
| {{TIME_3}} | {{EVENT_3}} — response started |
| {{TIME_4}} | {{EVENT_4}} — mitigated |
| {{TIME_5}} | {{EVENT_5}} — fully resolved |

---

## Root Cause Analysis

### Root Cause

{{ROOT_CAUSE}}

### Five Whys

1. Why did {{SYMPTOM}}? → {{WHY_1}}
2. Why did {{WHY_1}}? → {{WHY_2}}
3. Why did {{WHY_2}}? → {{WHY_3}}
4. Why did {{WHY_3}}? → {{WHY_4}}
5. Why did {{WHY_4}}? → {{ROOT_CAUSE}}

---

## What Went Well

- {{GOOD_1}}
- {{GOOD_2}}

---

## What Went Poorly

- {{BAD_1}}
- {{BAD_2}}

---

## Action Items

| Action | Owner | Priority | Due | Status |
| --- | --- | --- | --- | --- |
| {{ACTION_1}} | {{OWNER_1}} | P1 | {{DUE_1}} | Open |
| {{ACTION_2}} | {{OWNER_2}} | P2 | {{DUE_2}} | Open |
| {{ACTION_3}} | {{OWNER_3}} | P3 | {{DUE_3}} | Open |

---

## Prevention

{{PREVENTION}}
""",
    },
    {
        "id": "sla",
        "title": "Service Level Agreement (SLA)",
        "profiles": ["operations", "legal", "sales"],
        "keywords": ["sla", "service level", "uptime", "response time", "support", "availability", "agreement"],
        "use_cases": ["Write an SLA", "Define service levels", "Create a support agreement"],
        "content": """\
# Service Level Agreement

**Service:** {{SERVICE_NAME}}
**Provider:** {{PROVIDER}}
**Customer:** {{CUSTOMER}}
**Effective date:** {{START_DATE}}
**Review date:** {{REVIEW_DATE}}

---

## 1. Service Description

{{SERVICE_DESCRIPTION}}

---

## 2. Service Levels

### 2.1 Availability

| Environment | Target Uptime | Measurement Period |
| --- | --- | --- |
| Production | {{PROD_UPTIME}}% | Monthly |
| Staging | {{STAGING_UPTIME}}% | Monthly |

### 2.2 Incident Response

| Priority | Definition | Response Time | Resolution Target |
| --- | --- | --- | --- |
| P1 — Critical | {{P1_DEF}} | {{P1_RESPONSE}} | {{P1_RESOLUTION}} |
| P2 — High | {{P2_DEF}} | {{P2_RESPONSE}} | {{P2_RESOLUTION}} |
| P3 — Medium | {{P3_DEF}} | {{P3_RESPONSE}} | {{P3_RESOLUTION}} |
| P4 — Low | {{P4_DEF}} | {{P4_RESPONSE}} | {{P4_RESOLUTION}} |

### 2.3 Support Hours

**Standard support:** {{SUPPORT_HOURS}}
**Emergency support:** {{EMERGENCY_HOURS}}
**Contact:** {{SUPPORT_CONTACT}}

---

## 3. Exclusions

This SLA does not apply to: {{EXCLUSIONS}}

---

## 4. Reporting

Provider will deliver {{REPORT_FREQUENCY}} performance reports including uptime, incidents, and SLA compliance.

---

## 5. Service Credits

If SLA targets are not met:

| Uptime achieved | Credit |
| --- | --- |
| {{UPTIME_TIER_1}} | {{CREDIT_1}} |
| {{UPTIME_TIER_2}} | {{CREDIT_2}} |

Credits are capped at **{{CREDIT_CAP}}** per month.

---

## 6. Signatures

| Provider | Customer |
| --- | --- |
| _________________ | _________________ |
| {{PROVIDER_SIGNATORY}} | {{CUSTOMER_SIGNATORY}} |
| Date: ___________ | Date: ___________ |
""",
    },
    {
        "id": "vendor-evaluation",
        "title": "Vendor / Supplier Evaluation",
        "profiles": ["operations", "procurement", "finance"],
        "keywords": [
            "vendor",
            "supplier",
            "evaluation",
            "procurement",
            "rfq",
            "selection",
            "comparison",
            "due diligence",
        ],
        "use_cases": ["Evaluate vendors", "Compare suppliers", "Select a procurement partner"],
        "content": """\
# Vendor Evaluation: {{PRODUCT_OR_SERVICE}}

**Prepared by:** {{AUTHOR}}
**Date:** {{DATE}}
**Decision required by:** {{DECISION_DATE}}

---

## Evaluation Criteria & Weights

| Criterion | Weight |
| --- | --- |
| Price / cost | {{WEIGHT_PRICE}}% |
| Quality | {{WEIGHT_QUALITY}}% |
| Technical capability | {{WEIGHT_TECH}}% |
| Support & SLA | {{WEIGHT_SUPPORT}}% |
| Financial stability | {{WEIGHT_FINANCIAL}}% |
| References | {{WEIGHT_REF}}% |
| **Total** | **100%** |

---

## Vendor Scorecard

| Criterion | Weight | {{VENDOR_1}} | {{VENDOR_2}} | {{VENDOR_3}} |
| --- | --- | --- | --- | --- |
| Price | {{WEIGHT_PRICE}}% | {{SCORE_1_1}} | {{SCORE_2_1}} | {{SCORE_3_1}} |
| Quality | {{WEIGHT_QUALITY}}% | {{SCORE_1_2}} | {{SCORE_2_2}} | {{SCORE_3_2}} |
| Technical | {{WEIGHT_TECH}}% | {{SCORE_1_3}} | {{SCORE_2_3}} | {{SCORE_3_3}} |
| Support | {{WEIGHT_SUPPORT}}% | {{SCORE_1_4}} | {{SCORE_2_4}} | {{SCORE_3_4}} |
| Financial | {{WEIGHT_FINANCIAL}}% | {{SCORE_1_5}} | {{SCORE_2_5}} | {{SCORE_3_5}} |
| **Weighted Total** | **100%** | **{{TOTAL_1}}** | **{{TOTAL_2}}** | **{{TOTAL_3}}** |

*(Scores out of 10)*

---

## Commercial Summary

| | {{VENDOR_1}} | {{VENDOR_2}} | {{VENDOR_3}} |
| --- | --- | --- | --- |
| Unit price | {{PRICE_1}} | {{PRICE_2}} | {{PRICE_3}} |
| Annual cost | {{ANNUAL_1}} | {{ANNUAL_2}} | {{ANNUAL_3}} |
| Contract term | {{TERM_1}} | {{TERM_2}} | {{TERM_3}} |
| Payment terms | {{PAY_1}} | {{PAY_2}} | {{PAY_3}} |

---

## Reference Checks

| Vendor | Reference | Feedback |
| --- | --- | --- |
| {{VENDOR_1}} | {{REF_1}} | {{FEEDBACK_1}} |
| {{VENDOR_2}} | {{REF_2}} | {{FEEDBACK_2}} |

---

## Recommendation

**Recommended vendor:** {{RECOMMENDED_VENDOR}}
**Rationale:** {{RATIONALE}}
**Next steps:** {{NEXT_STEPS}}
""",
    },
    {
        "id": "process-improvement",
        "title": "Process Improvement Proposal",
        "profiles": ["operations", "business-analyst"],
        "keywords": ["process improvement", "lean", "efficiency", "optimisation", "kaizen", "bottleneck", "waste"],
        "use_cases": ["Write a process improvement proposal", "Optimise a workflow", "Document a process change"],
        "content": """\
# Process Improvement Proposal: {{PROCESS_NAME}}

**Prepared by:** {{AUTHOR}}
**Date:** {{DATE}}
**Sponsor:** {{SPONSOR}}

---

## Current State

{{CURRENT_STATE_DESCRIPTION}}

**Key issues:**
- {{ISSUE_1}}: {{IMPACT_1}}
- {{ISSUE_2}}: {{IMPACT_2}}
- {{ISSUE_3}}: {{IMPACT_3}}

**Current metrics:**
| Metric | Current Value |
| --- | --- |
| Cycle time | {{CURRENT_CYCLE}} |
| Error rate | {{CURRENT_ERROR}} |
| Cost per unit | {{CURRENT_COST}} |

---

## Root Cause Analysis

{{ROOT_CAUSE}}

---

## Proposed Improvements

### Improvement 1: {{IMPROVEMENT_1}}
{{IMPROVEMENT_1_DETAIL}}
*Expected benefit: {{BENEFIT_1}}*

### Improvement 2: {{IMPROVEMENT_2}}
{{IMPROVEMENT_2_DETAIL}}
*Expected benefit: {{BENEFIT_2}}*

---

## Expected Future State

| Metric | Current | Target | Improvement |
| --- | --- | --- | --- |
| Cycle time | {{CURRENT_CYCLE}} | {{TARGET_CYCLE}} | {{PCT_CYCLE}}% |
| Error rate | {{CURRENT_ERROR}} | {{TARGET_ERROR}} | {{PCT_ERROR}}% |
| Cost per unit | {{CURRENT_COST}} | {{TARGET_COST}} | {{PCT_COST}}% |

---

## Implementation Plan

| Phase | Activities | Owner | Timeline |
| --- | --- | --- | --- |
| 1. Plan | {{PLAN_ACT}} | {{PLAN_OWN}} | {{PLAN_TIME}} |
| 2. Pilot | {{PILOT_ACT}} | {{PILOT_OWN}} | {{PILOT_TIME}} |
| 3. Roll-out | {{ROLLOUT_ACT}} | {{ROLLOUT_OWN}} | {{ROLLOUT_TIME}} |

---

## Investment Required

{{INVESTMENT}}

---

## Recommendation

{{RECOMMENDATION}}
""",
    },
]

# ── Write templates ────────────────────────────────────────────────────────────
created, skipped = 0, 0
for t in TEMPLATES:
    if t.get("existing"):
        continue
    path = TEMPLATES_DIR / f"{t['id']}.md"
    if path.exists():
        skipped += 1
        continue
    path.write_text(t["content"].lstrip(), encoding="utf-8")
    created += 1

print(f"Templates: {created} created, {skipped} skipped (already exist)")

# ── Build index ────────────────────────────────────────────────────────────────
index = {
    "version": "1.0",
    "description": "Worker agent document template search index. Match user request to template ID then read the template file.",
    "usage": "Search keywords, profiles, and use_cases fields. Use the id to read bzcode/templates/{id}.md",
    "templates": [],
}

all_profiles = set()
for t in TEMPLATES:
    all_profiles.update(t["profiles"])

for t in TEMPLATES:
    index["templates"].append(
        {
            "id": t["id"],
            "title": t["title"],
            "file": f"bzcode/templates/{t['id']}.md",
            "profiles": t["profiles"],
            "keywords": t["keywords"],
            "use_cases": t["use_cases"],
        }
    )

index_path = TEMPLATES_DIR / "index.json"
index_path.write_text(json.dumps(index, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Index written → {index_path}  ({len(index['templates'])} templates, {len(all_profiles)} profiles)")
print("Profiles:", sorted(all_profiles))
