import { JobModel } from "../models/schemas";

export const OpportunityDedupService = {
  /**
   * Automatically marks opportunities as "EXPIRED" if their deadline has passed.
   */
  async expireJobsWithPassedDeadlines(): Promise<void> {
    const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    
    await JobModel.updateMany(
      {
        deadline: { $lt: todayStr, $ne: "See notification", $ne: null },
        status: { $nin: ["EXPIRED", "REMOVED", "Closed"] }
      },
      {
        $set: {
          status: "EXPIRED",
          changeType: "EXPIRED",
          lastChanged: new Date().toISOString(),
          lastVerified: new Date().toISOString()
        }
      }
    );
  },

  /**
   * Marks opportunities that are no longer found in the source crawl as "REMOVED".
   */
  async handleRemovedOpportunities(websiteUrl: string, activeIds: string[]): Promise<void> {
    const source = new URL(websiteUrl).hostname.replace("www.", "");
    
    await JobModel.updateMany(
      {
        source,
        id: { $nin: activeIds },
        status: { $in: ["Open", "Opening Soon", "Ongoing", "Unknown"] }
      },
      {
        $set: {
          status: "REMOVED",
          changeType: "REMOVED",
          lastChanged: new Date().toISOString(),
          lastVerified: new Date().toISOString()
        }
      }
    );
  },

  /**
   * Resolves duplicates and updates job database documents
   */
  async deduplicateAndSave(newJobs: any[]): Promise<string[]> {
    if (!newJobs || newJobs.length === 0) return [];

    const activeIds: string[] = [];

    for (const job of newJobs) {
      // Find matching existing record using organization, title, applicationUrl (or applyLink)
      const query = {
        organization: job.organization,
        title: job.title,
        $or: [
          { applyLink: job.applyLink },
          { applicationUrl: job.applicationUrl }
        ]
      };

      const existing = await JobModel.findOne(query);

      if (!existing) {
        // Brand new opportunity
        const jobDoc = new JobModel({
          ...job,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          lastVerified: new Date().toISOString(),
          lastChanged: new Date().toISOString(),
          lastAIProcessed: new Date().toISOString(),
          changeType: "NEW",
          isUpdated: false,
          aiStatus: "PROCESSED",
          retryCount: 0,
          previousValues: {},
        });
        await jobDoc.save();
        activeIds.push(jobDoc.id);
      } else {
        // Existing opportunity found - evaluate change type
        const previousValues: any = {};
        const changedFields: string[] = [];
        let changeType = "NO_CHANGE";

        const checkChange = (field: string, newValue: any, oldValue: any, typeName: string) => {
          if (newValue !== undefined && newValue !== null && newValue !== oldValue) {
            previousValues[field] = oldValue;
            changedFields.push(field);
            changeType = typeName;
          }
        };

        checkChange("deadline", job.deadline || job.lastDate, existing.deadline || existing.lastDate, "DEADLINE_CHANGED");
        checkChange("stipend", job.stipend, existing.stipend, "STIPEND_CHANGED");
        checkChange("applyLink", job.applyLink, existing.applyLink, "APPLICATION_LINK_CHANGED");
        checkChange("status", job.status, existing.status, "STATUS_CHANGED");
        checkChange("eligibility", job.qualification || job.eligibility, existing.qualification || existing.eligibility, "ELIGIBILITY_CHANGED");
        checkChange("location", job.location, existing.location, "LOCATION_CHANGED");
        checkChange("duration", job.duration, existing.duration, "DURATION_CHANGED");
        checkChange("certificateAvailable", job.certificateAvailable, existing.certificateAvailable, "CERTIFICATE_CHANGED");
        checkChange("requiredDocuments", job.requiredDocuments ? job.requiredDocuments.join(",") : "", existing.requiredDocuments ? existing.requiredDocuments.join(",") : "", "DOCUMENTS_CHANGED");
        checkChange("description", job.description, existing.description, "CONTENT_CHANGED");

        const hasSubstantialChange = changedFields.length > 0;

        await JobModel.updateOne(
          { id: existing.id },
          {
            $set: {
              ...job,
              id: existing.id, // preserve id
              lastSeen: new Date().toISOString(),
              lastVerified: new Date().toISOString(),
              changeType: hasSubstantialChange ? changeType : existing.changeType,
              isUpdated: hasSubstantialChange ? true : existing.isUpdated,
              lastChanged: hasSubstantialChange ? new Date().toISOString() : existing.lastChanged,
              lastAIProcessed: new Date().toISOString(),
              aiStatus: "PROCESSED",
              retryCount: 0,
              previousValues: hasSubstantialChange 
                ? { ...existing.previousValues, ...previousValues } 
                : existing.previousValues,
              evidence: job.evidence || existing.evidence
            }
          }
        );
        activeIds.push(existing.id);
      }
    }

    return activeIds;
  }
};
