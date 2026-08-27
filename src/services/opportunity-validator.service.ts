export const OpportunityValidator = {
  // Master lists of keywords grouped by category
  KEYWORDS: {
    internship: [
      "internship", "internships", "intern", "student internship", "internship programme", 
      "internship program", "internship scheme", "internship opportunity", "internship opportunities", 
      "summer internship", "winter internship"
    ],
    training: [
      "student programme", "student program", "student opportunity", "student opportunities", 
      "student training", "student training programme", "student training program", "academic training", 
      "practical training", "industrial training", "summer training", "winter training", "training programme", 
      "training program"
    ],
    researchProject: [
      "research internship", "research training", "research opportunity", "research project", 
      "student project", "student projects", "project work", "project training", "project trainee", 
      "project trainees", "dissertation", "dissertation work", "academic project", "final year project", 
      "major project", "minor project"
    ],
    careerTechnical: [
      "fellowship", "student fellowship", "graduate fellowship", "apprenticeship", "trainee", 
      "graduate trainee", "technical trainee", "student trainee", "industrial trainee", "career opportunity", 
      "work-based learning", "experiential learning"
    ],
    application: [
      "applications invited", "applications are invited", "apply now", "registration open", 
      "registration starts", "last date", "application deadline", "call for applications", 
      "invitation for applications", "notice", "notification", "advertisement", "vacancy", "open positions"
    ]
  },

  /**
   * Evaluates text relevance. Requires matching at least one keyword from the categories 
   * to avoid expensive AI classification.
   */
  isRelevant(text: string): boolean {
    if (!text) return false;
    const lowerText = text.toLowerCase();

    // Check if the page mentions at least one potential opportunity keyword AND an application indicator
    const hasInternshipType = [
      ...this.KEYWORDS.internship,
      ...this.KEYWORDS.training,
      ...this.KEYWORDS.researchProject,
      ...this.KEYWORDS.careerTechnical
    ].some(kw => lowerText.includes(kw));

    const hasApplicationIndicator = this.KEYWORDS.application.some(kw => lowerText.includes(kw));

    return hasInternshipType && hasApplicationIndicator;
  }
};
