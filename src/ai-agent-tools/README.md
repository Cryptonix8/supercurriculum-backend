# AI Agent Tools

A comprehensive toolkit for AI-powered curriculum management and personalized learning.

## Overview

This module provides 6 essential tools that enable AI agents to:
- Access curriculum data
- Analyze student performance
- Generate personalized activities
- Validate curriculum alignment
- Find educational resources

## Setup

### 1. Apply Database Migrations

First, apply the new curriculum tables to your database:

```bash
cd backend
npx prisma migrate dev --name add_curriculum_tables
npx prisma generate
```

This will:
- Create the 3 new tables (CurriculumTopic, SupercurriculumActivity, CurriculumStandard)
- Regenerate Prisma Client with the new types
- Resolve the linter errors

### 2. Restart the Backend

```bash
npm run start:dev
```

## The 6 Agent Tools

### 1. `curriculum_lookup`
**Purpose**: Retrieve curriculum content from database

**Endpoint**: `POST /api/ai-agent-tools/curriculum-lookup`

**Example Request**:
```json
{
  "subjectId": "uuid-of-english",
  "keyStage": "KS3",
  "topicName": "poetry"
}
```

**Example Response**:
```json
{
  "success": true,
  "topics": [
    {
      "id": "...",
      "topicName": "Poetry Analysis",
      "keyStage": "KS3",
      "learningObjectives": [...],
      "coreContent": "...",
      "keySkills": [...]
    }
  ],
  "count": 1
}
```

### 2. `extract_objectives`
**Purpose**: Get specific learning objectives

**Endpoint**: `POST /api/ai-agent-tools/extract-objectives`

**Example Request**:
```json
{
  "topicId": "uuid-of-topic"
}
```

### 3. `analyze_student`
**Purpose**: Analyze student data for personalization (Teachers/Admins only)

**Endpoint**: `POST /api/ai-agent-tools/analyze-student`

**Example Request**:
```json
{
  "userId": "uuid-of-student"
}
```

**Example Response**:
```json
{
  "success": true,
  "student": {
    "name": "John Doe",
    "yearGroup": "Year 8",
    "profile": {
      "preferredLearningMode": "MIXED",
      "weeklyStudyTime": 120
    },
    "performance": {
      "completionRate": "85.5",
      "recentAccuracy": "78.2"
    },
    "strengths": [...],
    "weaknesses": [...]
  }
}
```

### 4. `generate_activity_template`
**Purpose**: Create structured activity templates (Teachers/Admins only)

**Endpoint**: `POST /api/ai-agent-tools/generate-activity-template`

**Example Request**:
```json
{
  "topicId": "uuid-of-topic",
  "extensionLevel": "BEYOND_CURRICULUM"
}
```

### 5. `validate_standards`
**Purpose**: Check curriculum alignment

**Endpoint**: `POST /api/ai-agent-tools/validate-standards`

**Example Request**:
```json
{
  "keyStage": "KS3",
  "subjectId": "uuid-of-subject"
}
```

### 6. `find_resources`
**Purpose**: Find educational resources

**Endpoint**: `GET /api/ai-agent-tools/find-resources`

**Example Request**:
```bash
GET /api/ai-agent-tools/find-resources?topic=algebra&subject=maths&keyStage=KS3
```

**Example Response**:
```json
{
  "success": true,
  "resources": [
    {
      "type": "video",
      "platform": "BBC Bitesize",
      "title": "Maths - algebra",
      "url": "https://www.bbc.co.uk/bitesize/...",
      "free": true,
      "recommended": true
    },
    {
      "type": "interactive",
      "platform": "Khan Academy",
      "title": "Maths - algebra",
      "url": "https://www.khanacademy.org/math",
      "free": true
    }
  ],
  "count": 5
}
```

## Using with OpenAI Function Calling

### Basic Example

```typescript
import { AiAgentOrchestratorService } from './ai-agent-orchestrator.service';

// In your service or controller
async generatePersonalizedContent(userId: string, subject: string) {
  const result = await this.orchestrator.runAgentWithTools({
    userMessage: `Create a personalized activity for this student in ${subject}`,
    context: { userId, subject }
  });

  return result;
}
```

### Advanced Example with Conversation History

```typescript
async chatWithAgent(params: {
  message: string;
  userId: string;
  history: Array<{role: string; content: string}>;
}) {
  const result = await this.orchestrator.runAgentWithTools({
    userMessage: params.message,
    context: { userId: params.userId },
    conversationHistory: params.history
  });

  return {
    response: result.response,
    toolsUsed: result.toolsUsed,  // See which tools the AI used
    history: result.conversationHistory
  };
}
```

### Specific Use Cases

```typescript
// 1. Generate personalized activity
const activity = await this.orchestrator.generatePersonalizedActivity({
  userId: 'student-uuid',
  subjectId: 'subject-uuid',
  topicName: 'Algebra'
});

// 2. Get curriculum resources
const resources = await this.orchestrator.getCurriculumResources({
  topicName: 'Photosynthesis',
  subject: 'Science',
  keyStage: 'KS3'
});
```

## OpenAI Function Definitions

All 6 tools are defined in `agent-functions.config.ts` and can be used with:
- OpenAI's function calling API
- Custom agent implementations
- Langchain or other agent frameworks

```typescript
import { AGENT_FUNCTIONS } from './agent-functions.config';

const response = await openai.chat.completions.create({
  model: 'gpt-5.5',
  messages: [...],
  functions: AGENT_FUNCTIONS,
  function_call: 'auto'
});
```

## Authentication & Authorization

- All endpoints require JWT authentication (`@UseGuards(JwtAuthGuard)`)
- `analyze_student` and `generate_activity_template` require TEACHER or ADMIN role
- Other tools are available to all authenticated users

## API Documentation

Full API documentation available at:
```
http://localhost:3000/api/docs
```

Look for the "AI Agent Tools" section in Swagger UI.

## Testing

### Test individual tools:

```bash
# Using curl
curl -X POST http://localhost:3000/api/ai-agent-tools/find-resources \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Shakespeare",
    "subject": "English",
    "keyStage": "KS3"
  }'
```

### Test with AI orchestrator:

Create a test endpoint in your controller:

```typescript
@Post('test-agent')
async testAgent(@Body() body: { message: string; userId: string }) {
  return this.orchestrator.runAgentWithTools({
    userMessage: body.message,
    context: { userId: body.userId }
  });
}
```

## Architecture

```
AiAgentToolsModule
├── AiAgentToolsService (Core tools implementation)
├── AiAgentOrchestratorService (OpenAI function calling)
├── AiAgentToolsController (REST API endpoints)
└── DTOs (Request validation)
```

## Example Workflows

### Workflow 1: Personalized Activity Creation

```
1. analyze_student → Get student profile
2. curriculum_lookup → Find relevant topics
3. extract_objectives → Get learning goals
4. generate_activity_template → Create activity
5. find_resources → Add supporting materials
6. validate_standards → Ensure alignment
```

### Workflow 2: Teacher Content Discovery

```
1. curriculum_lookup → Browse topics
2. validate_standards → Check requirements
3. find_resources → Get teaching materials
```

### Workflow 3: AI Tutor Session

```
1. analyze_student → Understand learner
2. extract_objectives → Know what to teach
3. find_resources → Provide learning materials
```

## Future Enhancements

- [ ] Cache frequently accessed curriculum data
- [ ] Add more resource platforms (Quizlet, Duolingo, etc.)
- [ ] Implement activity effectiveness tracking
- [ ] Add batch operations for multiple students
- [ ] Integrate with LMS platforms
- [ ] Add multilingual support

## Support

For issues or questions:
1. Check the Swagger documentation
2. Review the example code above
3. Check the service implementation for detailed comments

