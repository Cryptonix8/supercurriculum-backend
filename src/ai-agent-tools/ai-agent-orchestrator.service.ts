import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiAgentToolsService } from './ai-agent-tools.service';
import { AGENT_FUNCTIONS, FUNCTION_HANDLERS, AGENT_SYSTEM_PROMPT } from './agent-functions.config';

/**
 * AI Agent Orchestrator
 * Handles OpenAI function calling and tool execution
 */
@Injectable()
export class AiAgentOrchestratorService {
  private openai: OpenAI;

  constructor(
    private config: ConfigService,
    private aiAgentTools: AiAgentToolsService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  /**
   * Main method to interact with the AI agent using function calling
   */
  async runAgentWithTools(params: {
    userMessage: string;
    context?: any;
    conversationHistory?: Array<{ role: string; content: string }>;
  }) {
    try {
      // Build messages
      const messages: any[] = [
        {
          role: 'system',
          content: AGENT_SYSTEM_PROMPT,
        },
      ];

      // Add conversation history
      if (params.conversationHistory) {
        messages.push(...params.conversationHistory);
      }

      // Add current user message
      messages.push({
        role: 'user',
        content: params.userMessage,
      });

      // Call OpenAI with function calling
      let response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        functions: AGENT_FUNCTIONS,
        function_call: 'auto',
        temperature: 0.7,
        max_tokens: 2000,
      });

      let assistantMessage = response.choices[0].message;
      const toolCalls: any[] = [];

      // Handle function calls iteratively
      while (assistantMessage.function_call) {
        const functionName = assistantMessage.function_call.name;
        const functionArgs = JSON.parse(assistantMessage.function_call.arguments || '{}');

        // Execute the tool
        const toolResult = await this.executeTool(functionName, functionArgs);
        
        toolCalls.push({
          name: functionName,
          arguments: functionArgs,
          result: toolResult,
        });

        // Add function result to messages
        messages.push({
          role: 'assistant',
          content: null,
          function_call: assistantMessage.function_call,
        });

        messages.push({
          role: 'function',
          name: functionName,
          content: JSON.stringify(toolResult),
        });

        // Get next response from AI
        response = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages,
          functions: AGENT_FUNCTIONS,
          function_call: 'auto',
          temperature: 0.7,
          max_tokens: 2000,
        });

        assistantMessage = response.choices[0].message;
      }

      return {
        success: true,
        response: assistantMessage.content,
        toolsUsed: toolCalls,
        conversationHistory: messages,
      };
    } catch (error) {
      console.error('Error in agent orchestrator:', error);
      return {
        success: false,
        error: 'Failed to process agent request',
        response: 'I encountered an error while processing your request. Please try again.',
        toolsUsed: [],
      };
    }
  }

  /**
   * Execute a specific tool by name
   */
  private async executeTool(functionName: string, args: any) {
    const handlerMethod = FUNCTION_HANDLERS[functionName as keyof typeof FUNCTION_HANDLERS];
    
    if (!handlerMethod) {
      return { success: false, error: 'Unknown function' };
    }

    try {
      // Call the appropriate method on AiAgentToolsService
      const result = await (this.aiAgentTools as any)[handlerMethod](args);
      return result;
    } catch (error) {
      console.error(`Error executing tool ${functionName}:`, error);
      return { success: false, error: `Failed to execute ${functionName}` };
    }
  }

  /**
   * Simplified method for specific use cases
   */
  async generatePersonalizedActivity(params: {
    userId: string;
    subjectId: string;
    topicName?: string;
  }) {
    const prompt = `Create a personalized supercurriculum activity for this student.
Subject: ${params.subjectId}
${params.topicName ? `Topic: ${params.topicName}` : ''}

Steps:
1. Analyze the student's profile and performance
2. Find relevant curriculum topics
3. Extract learning objectives
4. Generate an activity template
5. Find supporting resources
6. Ensure curriculum alignment`;

    return this.runAgentWithTools({
      userMessage: prompt,
      context: { userId: params.userId, subjectId: params.subjectId },
    });
  }

  /**
   * Get curriculum-aligned resources for a topic
   */
  async getCurriculumResources(params: {
    topicName: string;
    subject: string;
    keyStage: string;
  }) {
    const prompt = `Find comprehensive resources for teaching "${params.topicName}" in ${params.subject} for ${params.keyStage}.

Include:
1. Curriculum alignment information
2. Learning objectives
3. External resources (BBC Bitesize, Khan Academy, etc.)
4. Activity suggestions`;

    return this.runAgentWithTools({
      userMessage: prompt,
      context: params,
    });
  }
}

