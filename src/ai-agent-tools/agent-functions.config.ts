/**
 * OpenAI Function Calling Definitions for AI Agent Tools
 * These can be used with OpenAI's function calling feature to let the AI
 * decide when to use each tool.
 */

export const AGENT_FUNCTIONS = [
  {
    name: 'curriculum_lookup',
    description: 'Retrieves curriculum content from the database. Use this to find topics, learning objectives, and curriculum information for specific year groups, subjects, or key stages.',
    parameters: {
      type: 'object',
      properties: {
        yearGroupId: {
          type: 'string',
          description: 'The UUID of the year group (e.g., Year 7, Year 8)',
        },
        subjectId: {
          type: 'string',
          description: 'The UUID of the subject (e.g., English, Maths, Science)',
        },
        keyStage: {
          type: 'string',
          enum: ['KS2', 'KS3', 'KS4', 'KS5'],
          description: 'The UK Key Stage',
        },
        topicName: {
          type: 'string',
          description: 'Search for topics by name (case-insensitive partial match)',
        },
      },
      required: [],
    },
  },
  {
    name: 'extract_objectives',
    description: 'Extracts specific learning objectives for curriculum topics. Use this when you need detailed learning objectives, key skills, or prior knowledge requirements.',
    parameters: {
      type: 'object',
      properties: {
        topicId: {
          type: 'string',
          description: 'The UUID of a specific curriculum topic',
        },
        yearGroupId: {
          type: 'string',
          description: 'Filter by year group UUID',
        },
        subjectId: {
          type: 'string',
          description: 'Filter by subject UUID',
        },
        keyStage: {
          type: 'string',
          enum: ['KS2', 'KS3', 'KS4', 'KS5'],
          description: 'Filter by UK Key Stage',
        },
      },
      required: [],
    },
  },
  {
    name: 'analyze_student',
    description: 'Analyzes a student\'s data for personalization. Returns comprehensive student profile including learning preferences, strengths, weaknesses, current performance, and active learning plan. Use this to personalize activities and recommendations.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'The UUID of the student to analyze',
        },
      },
      required: ['userId'],
    },
  },
  {
    name: 'generate_activity_template',
    description: 'Creates a structured activity template based on curriculum topics. Use this to generate scaffolded activities with learning objectives, success criteria, and differentiation strategies.',
    parameters: {
      type: 'object',
      properties: {
        topicId: {
          type: 'string',
          description: 'The UUID of the curriculum topic to base the activity on',
        },
        extensionLevel: {
          type: 'string',
          enum: ['BEYOND_CURRICULUM', 'ENRICHMENT'],
          description: 'The level of extension: BEYOND_CURRICULUM for advanced academic work, ENRICHMENT for broader applications',
        },
        targetYearGroup: {
          type: 'string',
          description: 'Optional: Target year group if different from topic default',
        },
        difficulty: {
          type: 'string',
          description: 'Optional: Specific difficulty level',
        },
      },
      required: ['topicId', 'extensionLevel'],
    },
  },
  {
    name: 'validate_standards',
    description: 'Checks curriculum alignment with UK National Curriculum standards. Use this to ensure activities and content meet official standards and requirements.',
    parameters: {
      type: 'object',
      properties: {
        activityId: {
          type: 'string',
          description: 'UUID of a supercurriculum activity to validate',
        },
        topicId: {
          type: 'string',
          description: 'UUID of a curriculum topic to get standards for',
        },
        keyStage: {
          type: 'string',
          enum: ['KS2', 'KS3', 'KS4', 'KS5'],
          description: 'Get standards for a specific Key Stage',
        },
        subjectId: {
          type: 'string',
          description: 'Get standards for a specific subject',
        },
      },
      required: [],
    },
  },
  {
    name: 'find_resources',
    description: 'Finds external educational resources from BBC Bitesize, Khan Academy, Oak National Academy, and other platforms. Use this to supplement activities with high-quality educational content.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'The topic or concept to find resources for',
        },
        subject: {
          type: 'string',
          description: 'The subject area (e.g., English, Maths, Science)',
        },
        keyStage: {
          type: 'string',
          enum: ['KS2', 'KS3', 'KS4', 'KS5'],
          description: 'The UK Key Stage for age-appropriate resources',
        },
        yearGroup: {
          type: 'string',
          description: 'Specific year group (e.g., "Year 7", "Year 10")',
        },
        resourceTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['video', 'interactive', 'article', 'worksheet'],
          },
          description: 'Filter by resource types',
        },
      },
      required: ['topic', 'subject'],
    },
  },
];

/**
 * Maps function names to their handler methods
 */
export const FUNCTION_HANDLERS = {
  curriculum_lookup: 'curriculumLookup',
  extract_objectives: 'extractObjectives',
  analyze_student: 'analyzeStudent',
  generate_activity_template: 'generateActivityTemplate',
  validate_standards: 'validateStandards',
  find_resources: 'findResources',
};

/**
 * Example prompt for using these tools with OpenAI
 */
export const AGENT_SYSTEM_PROMPT = `You are an AI educational agent with access to powerful tools to help personalize learning.

Available Tools:
1. curriculum_lookup - Search curriculum database
2. extract_objectives - Get learning objectives  
3. analyze_student - Analyze student performance and preferences
4. generate_activity_template - Create structured activities
5. validate_standards - Check curriculum alignment
6. find_resources - Find BBC Bitesize, Khan Academy resources

When helping with educational tasks:
- Use analyze_student first to understand the learner
- Use curriculum_lookup to find relevant topics
- Use extract_objectives to get specific learning goals
- Use generate_activity_template to create personalized activities
- Use find_resources to supplement with quality external content
- Use validate_standards to ensure curriculum compliance

Always prioritize student needs and learning outcomes.`;

