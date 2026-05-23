/**
 * SuperCurriculum Data Template
 * 
 * This file shows the complete data structure for ONE subject.
 * Replicate this pattern for all 14 subjects across all year groups.
 */

import { Band, ActivityType } from '@prisma/client';

// ============================================
// SUBJECT: ENGLISH (Year 7)
// ============================================

export const englishYear7 = {
  subject: {
    name: 'english',
    displayName: 'English',
    description: 'Develop your reading, writing, and communication skills',
    whyMatters: `English skills are fundamental to all learning. They help you express ideas clearly, 
      understand complex texts, and communicate effectively in all areas of life. The SuperCurriculum 
      extends beyond the classroom to help you discover literature, develop your voice as a writer, 
      and engage with ideas that matter to you.`,
    iconName: 'book',
    colorCode: '#4CAF50',
    orderIndex: 1,
  },

  skills: [
    {
      name: 'reading',
      displayName: 'Reading',
      description: 'Understanding and analyzing texts across different genres',
      orderIndex: 1,
      
      // Feedback Test (4 statements, 1-5 scale)
      feedbackTest: {
        title: 'Reading Skills Self-Assessment',
        description: 'Rate yourself on these reading skills (1=Strongly Disagree, 5=Strongly Agree)',
        questions: [
          'I can identify the main ideas and key themes in a text',
          'I can make inferences and read between the lines',
          'I can analyze how authors use language for effect',
          'I can compare different texts and evaluate viewpoints',
        ],
      },

      // Interventions (one per band)
      interventions: [
        {
          band: Band.NEEDS_SUPPORT, // Score 1-2
          description: 'Focus on building confidence with shorter texts and guided reading',
          taskGuidance: `Start with accessible texts at your level. Use graphic organizers to map out 
            main ideas. Annotate key points as you read. Discuss texts with others to build understanding.`,
          expectedOutcome: `Student can identify 2-3 main ideas with support and explain them in their own words. 
            Shows growing confidence in approaching new texts.`,
        },
        {
          band: Band.DEVELOPING, // Score 3
          description: 'Practice analytical reading with age-appropriate texts',
          taskGuidance: `Read varied texts independently. Make notes on themes, character development, 
            and techniques. Practice summarizing and explaining author\'s choices.`,
          expectedOutcome: `Student can analyze texts independently and explain author's methods with examples. 
            Can make thoughtful inferences and connections.`,
        },
        {
          band: Band.SECURE, // Score 4-5
          description: 'Extend analytical skills with challenging texts and comparative analysis',
          taskGuidance: `Analyze complex texts with multiple layers of meaning. Compare multiple perspectives 
            and texts. Explore subtle meanings, ambiguity, and sophisticated effects.`,
          expectedOutcome: `Student provides sophisticated analysis with well-chosen evidence. Can compare 
            texts effectively and evaluate different interpretations.`,
        },
      ],

      // Activities (5-10 per band)
      activities: {
        NEEDS_SUPPORT: [
          {
            title: 'Read: "The Day the Crayons Quit" by Drew Daywalt',
            description: 'A fun, accessible story told through letters from crayons to their owner',
            instructions: `Read this short book (or selected letters). As you read, note down:
              - What each crayon is complaining about
              - Which crayon do you relate to most and why?
              - What message is the author giving about different perspectives?`,
            activityType: ActivityType.READING,
            difficulty: Band.NEEDS_SUPPORT,
            estimatedMinutes: 25,
            resources: {
              bookLink: 'https://www.goodreads.com/book/show/16101514-the-day-the-crayons-quit',
              supportMaterials: ['Character map template', 'Reading comprehension questions'],
            },
          },
          {
            title: 'Listen: "The Gruffalo" Audiobook',
            description: 'Listen to this classic story and analyze the clever plot structure',
            instructions: `Listen to the audiobook of The Gruffalo. Pay attention to:
              - How does the mouse outsmart the other animals?
              - What pattern do you notice in the story structure?
              - How does repetition help build suspense?`,
            activityType: ActivityType.LISTENING,
            difficulty: Band.NEEDS_SUPPORT,
            estimatedMinutes: 20,
            externalUrl: 'https://www.youtube.com/watch?v=s8sUPpPc8ws',
          },
          {
            title: 'Watch: Animated Short - "The Present"',
            description: 'Watch and interpret a powerful short film about perspective',
            instructions: `Watch this 4-minute animated film. Then answer:
              - How did your opinion of the main character change?
              - What message is the filmmaker trying to share?
              - How did the film create an emotional response?`,
            activityType: ActivityType.WATCHING,
            difficulty: Band.NEEDS_SUPPORT,
            estimatedMinutes: 15,
            externalUrl: 'https://www.youtube.com/watch?v=WjqiU5FgsYc',
          },
          {
            title: 'Write: My Favourite Place Description',
            description: 'Practice descriptive writing using your five senses',
            instructions: `Think of your favourite place (real or imaginary). Write 2-3 paragraphs describing it using:
              - What you can SEE (colors, shapes, movement)
              - What you can HEAR (sounds near and far)
              - What you can SMELL and TASTE
              - What you can FEEL (textures, temperature)
              Use a writing frame if you need support.`,
            activityType: ActivityType.WRITING,
            difficulty: Band.NEEDS_SUPPORT,
            estimatedMinutes: 30,
          },
          {
            title: 'Research: Your Favourite Author',
            description: 'Investigate the life and work of an author you enjoy',
            instructions: `Choose an author whose books you love. Research and create a fact file:
              - When and where were they born?
              - What inspired them to write?
              - What are their most famous books?
              - What themes appear in their work?
              Present your findings in a poster or slide.`,
            activityType: ActivityType.RESEARCHING,
            difficulty: Band.NEEDS_SUPPORT,
            estimatedMinutes: 40,
          },
        ],

        DEVELOPING: [
          {
            title: 'Read: "The Boy in the Striped Pyjamas" - Chapter 1',
            description: 'Explore themes of innocence and perspective in historical fiction',
            instructions: `Read Chapter 1 of this powerful novel. As you read, consider:
              - What do we learn about Bruno and his family?
              - What atmosphere does the author create?
              - What questions does the opening raise?
              - What clues suggest this is set during a significant historical period?
              Write a response discussing the author's techniques.`,
            activityType: ActivityType.READING,
            difficulty: Band.DEVELOPING,
            estimatedMinutes: 35,
          },
          {
            title: 'Analyze: Poetry - "The Road Not Taken" by Robert Frost',
            description: 'Explore metaphor and meaning in a classic poem',
            instructions: `Read the poem carefully multiple times. Then analyze:
              - What is the literal journey described?
              - What might the 'roads' symbolize in life?
              - How does the structure (4 stanzas) support the message?
              - What does "and that has made all the difference" suggest?
              Write 2-3 paragraphs explaining your interpretation with evidence.`,
            activityType: ActivityType.READING,
            difficulty: Band.DEVELOPING,
            estimatedMinutes: 30,
          },
          {
            title: 'Watch & Analyze: TED-Ed - "How to Recognize Bias in News"',
            description: 'Develop critical media literacy skills',
            instructions: `Watch this TED-Ed video about identifying bias. Then:
              - List 3 ways bias can appear in media
              - Find a news article and analyze it for bias
              - Compare how two different sources report the same event
              - Write a summary of what you learned about reading critically`,
            activityType: ActivityType.WATCHING,
            difficulty: Band.DEVELOPING,
            estimatedMinutes: 35,
            externalUrl: 'https://ed.ted.com/',
          },
          {
            title: 'Creative Writing: Write from a Different Perspective',
            description: 'Develop empathy and narrative voice skills',
            instructions: `Choose a familiar story (Red Riding Hood, Cinderella, etc.). 
              Rewrite a scene from the antagonist's perspective. Consider:
              - What motivates this character?
              - How do they justify their actions?
              - What details would they notice that the protagonist wouldn't?
              - How can you make readers understand (not necessarily agree with) this perspective?
              Aim for 300-500 words.`,
            activityType: ActivityType.CREATIVE,
            difficulty: Band.DEVELOPING,
            estimatedMinutes: 45,
          },
          {
            title: 'Research: Shakespeare\'s Globe Theatre',
            description: 'Investigate the original performance space for Shakespeare\'s plays',
            instructions: `Research the Globe Theatre in London. Create a presentation covering:
              - The design and structure of the original theatre
              - What it was like to be an audience member in Shakespeare's time
              - How has it been reconstructed today?
              - Why does the performance space matter for understanding the plays?
              Include images and interesting facts.`,
            activityType: ActivityType.RESEARCHING,
            difficulty: Band.DEVELOPING,
            estimatedMinutes: 50,
          },
        ],

        SECURE: [
          {
            title: 'Read & Compare: Two Poems About War',
            description: 'Analyze and compare "Dulce et Decorum Est" and "The Soldier"',
            instructions: `Read both Wilfred Owen's "Dulce et Decorum Est" and Rupert Brooke's "The Soldier". 
              Write a comparative essay (500+ words) exploring:
              - How does each poem present war and patriotism?
              - What poetic techniques does each poet use (imagery, structure, tone)?
              - How does each poem's context (when/why it was written) affect its message?
              - Which poem do you find more powerful and why?
              Use quotations to support every point.`,
            activityType: ActivityType.READING,
            difficulty: Band.SECURE,
            estimatedMinutes: 60,
          },
          {
            title: 'Analyze: Rhetoric in Speeches - Martin Luther King Jr.',
            description: 'Examine persuasive techniques in the "I Have a Dream" speech',
            instructions: `Study the "I Have a Dream" speech. Analyze:
              - Identify and explain 5 rhetorical devices (e.g., anaphora, metaphor, allusion)
              - How does King build emotional connection with his audience?
              - How does he balance hope and criticism?
              - Why is this speech still powerful today?
              Write an analytical essay (600+ words) with embedded quotations.`,
            activityType: ActivityType.READING,
            difficulty: Band.SECURE,
            estimatedMinutes: 70,
            externalUrl: 'https://www.americanrhetoric.com/speeches/mlkihaveadream.htm',
          },
          {
            title: 'Watch: Film Analysis - "Dead Poets Society" Opening Sequence',
            description: 'Analyze cinematography and symbolism in film',
            instructions: `Watch the first 15 minutes of Dead Poets Society. Analyze:
              - What atmosphere does the opening ceremony create?
              - How do camera angles and lighting establish the school's character?
              - What symbols represent tradition vs. freedom?
              - How are characters introduced visually?
              Write a detailed analysis (500+ words) of how visual storytelling works.`,
            activityType: ActivityType.WATCHING,
            difficulty: Band.SECURE,
            estimatedMinutes: 60,
          },
          {
            title: 'Student-Led: Book Club Discussion Leadership',
            description: 'Lead a discussion about a novel, preparing questions and facilitating debate',
            instructions: `Choose a novel for your group to read. As the discussion leader:
              - Prepare 8-10 thought-provoking discussion questions
              - Research the author's context and intentions
              - Identify key themes and controversial interpretations
              - Facilitate a 30-minute discussion, ensuring everyone participates
              - Summarize the main ideas that emerged
              This develops leadership, critical thinking, and synthesis skills.`,
            activityType: ActivityType.STUDENT_LED,
            difficulty: Band.SECURE,
            estimatedMinutes: 90,
          },
          {
            title: 'Research & Present: Gothic Literature Evolution',
            description: 'Trace the development of Gothic literature from 1700s to modern day',
            instructions: `Research the Gothic literary tradition. Create a comprehensive presentation:
              - Origins: Horace Walpole and early Gothic novels
              - Victorian Gothic: Bram Stoker, Mary Shelley
              - Modern Gothic: Neil Gaiman, Angela Carter
              - Key characteristics and how they've evolved
              - Why are we still fascinated by Gothic themes?
              Include visual examples and excerpts. Aim for a 10-15 minute presentation.`,
            activityType: ActivityType.RESEARCHING,
            difficulty: Band.SECURE,
            estimatedMinutes: 90,
          },
        ],
      },
    },

    // SKILL 2: WRITING
    {
      name: 'writing',
      displayName: 'Writing',
      description: 'Creating clear, effective, and creative written communication',
      orderIndex: 2,
      
      feedbackTest: {
        title: 'Writing Skills Self-Assessment',
        description: 'Rate yourself on these writing skills',
        questions: [
          'I can write clear and well-organized paragraphs',
          'I can use varied vocabulary effectively',
          'I can adapt my writing style for different purposes',
          'I can check and improve my own writing',
        ],
      },

      interventions: [
        {
          band: Band.NEEDS_SUPPORT,
          description: 'Build confidence with structured writing tasks and sentence-level support',
          taskGuidance: `Use writing frames and templates. Focus on one paragraph at a time. 
            Practice basic punctuation and sentence structure. Get feedback frequently.`,
          expectedOutcome: `Student can write clear paragraphs with topic sentences and supporting details. 
            Shows improved confidence and basic control of punctuation.`,
        },
        {
          band: Band.DEVELOPING,
          description: 'Develop extended writing with focus on organization and style',
          taskGuidance: `Plan before writing. Vary sentence structures. Use paragraphs effectively. 
            Develop vocabulary. Edit and improve own work.`,
          expectedOutcome: `Student produces well-organized multi-paragraph writing with clear style. 
            Can adapt tone for different purposes and audiences.`,
        },
        {
          band: Band.SECURE,
          description: 'Refine advanced writing techniques and develop distinctive voice',
          taskGuidance: `Experiment with sophisticated structures. Develop a personal writing voice. 
            Master nuanced vocabulary. Craft writing for specific effects.`,
          expectedOutcome: `Student produces sophisticated, controlled writing with clear voice. 
            Can manipulate language skillfully for precise effects.`,
        },
      ],

      activities: {
        NEEDS_SUPPORT: [
          // Add 5-10 activities similar to reading...
        ],
        DEVELOPING: [
          // Add 5-10 activities...
        ],
        SECURE: [
          // Add 5-10 activities...
        ],
      },
    },

    // SKILL 3: LISTENING
    {
      name: 'listening',
      displayName: 'Listening',
      description: 'Active listening and comprehension of spoken texts',
      orderIndex: 3,
      // ... similar structure
    },

    // SKILL 4: WATCHING
    {
      name: 'watching',
      displayName: 'Watching',
      description: 'Analyzing visual media and multimodal texts',
      orderIndex: 4,
      // ... similar structure
    },

    // SKILL 5: RESEARCHING
    {
      name: 'researching',
      displayName: 'Researching',
      description: 'Finding, evaluating, and synthesizing information',
      orderIndex: 5,
      // ... similar structure
    },

    // SKILL 6: STUDENT_LED
    {
      name: 'student_led',
      displayName: 'Student-led Tasks',
      description: 'Taking initiative and leading your own learning',
      orderIndex: 6,
      // ... similar structure
    },

    // SKILL 7: CREATIVE
    {
      name: 'creative',
      displayName: 'Creative Tasks',
      description: 'Original creative expression and project work',
      orderIndex: 7,
      // ... similar structure
    },
  ],
};

// ============================================
// REPLICATE THIS STRUCTURE FOR:
// ============================================
// 1. Maths (Year 7, 8, 9)
// 2. Science (Year 7, 8, 9)
// 3. History (Year 7, 8, 9)
// 4. Geography (Year 7, 8, 9)
// 5. Art & Design (Year 7, 8, 9)
// 6. Design & Technology (Year 7, 8, 9)
// 7. Music (Year 7, 8, 9)
// 8. PE (Year 7, 8, 9)
// 9. Religious Education (Year 7, 8, 9)
// 10. EAL (Year 7, 8, 9)
// 11. Spanish (Year 7, 8, 9)
// 12. Greek (Year 7, 8, 9)
// 13. PSHE & Citizenship (Year 7, 8, 9)

