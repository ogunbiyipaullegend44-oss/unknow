const EDUCATION_TERMS = /\b(education|school|schools|student|students|teacher|teachers|learning|literacy|university|universities)\b/i;
const HEALTH_TERMS = /\b(health|disease|cancer|medical|medicine|patient|patients|asthma|mental health|public health)\b/i;

function topicPhrase(question) {
  let topic = question
    .trim()
    .replace(/[?!.]+$/g, '')
    .replace(/^(?:how|what|why|when|where|which)\s+(?:is|are|does|do|did|has|have|can|will)\s+/i, '')
    .replace(/^(?:what are|what is|causes? of|effects? of|impact of|the role of|the relationship between)\s+/i, '')
    .replace(/\s+(?:from|between)\s+(?:(?:19|20)\d{2})(?:\s*(?:-|to|through)\s*(?:19|20)\d{2})?$/i, '')
    .trim();
  if (topic.length > 115) topic = `${topic.slice(0, 112).trimEnd()}...`;
  return topic || question.trim().replace(/[?!.]+$/g, '');
}

export function getRelatedTopics(research) {
  if (!research?.question || !research.analysis) return [];
  const topic = topicPhrase(research.analysis.mainSubject || research.question);
  const context = research.scope?.region || '';
  const where = context ? ` in ${context}` : '';
  const isEducation = EDUCATION_TERMS.test(`${topic} ${research.question}`);
  const isHealth = HEALTH_TERMS.test(`${topic} ${research.question}`);

  const topics = [
    {
      id: 'drivers',
      title: `Factors shaping ${topic}`,
      question: `Which social, economic, environmental, and institutional factors are associated with ${topic}${where}?`,
      why: `Identifying the conditions linked to ${topic} can help distinguish likely drivers from background context.`,
      relationship: `This investigates possible explanations for the same topic, ${topic}, rather than assuming a cause from the original search.`,
      evidence: 'Comparative or longitudinal studies, qualitative case studies, and disaggregated public datasets that measure relevant conditions.',
      categories: ['Academic Research', 'Government and Official Sources', 'Reports and Statistical Data'],
    },
    {
      id: 'outcomes',
      title: `Outcomes and affected groups`,
      question: `How is ${topic} associated with outcomes for different populations${where}, and which groups experience the largest differences?`,
      why: `Knowing who is affected and how outcomes differ helps make the original topic measurable and reveals distributional effects.`,
      relationship: `It follows the original topic into its observed consequences and differences between groups.`,
      evidence: 'Cohort studies, impact evaluations, population surveys, and official statistics broken down by relevant groups.',
      categories: ['Academic Research', 'Government and Official Sources', 'Reports and Statistical Data'],
    },
    {
      id: 'interventions',
      title: `Policies and interventions`,
      question: `Which policies or interventions have been evaluated for their effect on ${topic}${where}, and what outcomes were reported?`,
      why: `Evaluations can show which responses have evidence of effectiveness, for whom, and under what conditions.`,
      relationship: `This moves from describing ${topic} to examining tested responses to it.`,
      evidence: 'Policy evaluations, implementation studies, program datasets, and documented outcome measures.',
      categories: ['Government and Official Sources', 'Academic Research', 'Reports and Statistical Data'],
    },
    {
      id: 'comparisons',
      title: `Differences across places and time`,
      question: `How has ${topic} varied across regions or over time, and what contextual differences coincide with those changes?`,
      why: `Comparisons can reveal where the issue is different and help identify context worth investigating further.`,
      relationship: `It keeps the same topic but tests whether the original findings or patterns hold in other settings or periods.`,
      evidence: 'Cross-region or cross-country studies, historical series, repeated surveys, and comparable administrative datasets.',
      categories: ['Academic Research', 'Government and Official Sources', 'Reports and Statistical Data'],
    },
    {
      id: 'experience',
      title: `Lived experience and implementation`,
      question: `How do people directly affected by ${topic} describe their experiences, and how do these compare with institutional accounts${where}?`,
      why: `First-hand accounts can surface barriers, local context, and consequences that aggregate measures may miss.`,
      relationship: `It adds perspectives from affected communities to the topic and evidence in the original investigation.`,
      evidence: 'Peer-reviewed qualitative studies, interviews, community research, and carefully sourced local reporting.',
      categories: ['Academic Research', 'News and Journalism', 'Websites and Articles'],
    },
    {
      id: 'evidence-quality',
      title: `Strength and limits of the evidence`,
      question: `What are the strongest findings and main evidence gaps in research on ${topic}${where}?`,
      why: `Reviewing study design, coverage, and uncertainty helps show what the current evidence can—and cannot—support.`,
      relationship: `This checks the reliability and coverage of evidence behind the original research question.`,
      evidence: 'Systematic or scoping reviews, methods papers, replication studies, and source records with transparent limitations.',
      categories: ['Academic Research', 'Books and Other Publications', 'Reports and Statistical Data'],
    },
  ];

  if (isEducation) {
    topics.splice(2, 0, {
      id: 'education-funding',
      title: 'Funding and learning outcomes',
      question: `How are education funding levels and allocation associated with learning outcomes${where}?`,
      why: 'Connecting spending patterns to measured learning can clarify whether resources reach students and relate to outcomes.',
      relationship: `This examines a concrete system-level factor that may shape ${topic}.`,
      evidence: 'School finance records, learning assessments, budget analyses, and studies comparing funding changes with outcomes.',
      categories: ['Government and Official Sources', 'Academic Research', 'Reports and Statistical Data'],
    });
    topics.splice(3, 0, {
      id: 'education-employment',
      title: 'Education and employment',
      question: `How are educational access and learning outcomes related to employment opportunities${where}?`,
      why: 'Employment outcomes help assess how the education topic connects to later economic opportunity.',
      relationship: `This follows ${topic} into a related downstream outcome: access to work.`,
      evidence: 'Longitudinal education-to-work studies, labor-force surveys, employer data, and youth employment statistics.',
      categories: ['Academic Research', 'Government and Official Sources', 'Reports and Statistical Data'],
    });
    topics.splice(4, 0, {
      id: 'education-inequality',
      title: 'Educational inequality',
      question: `Which groups face the greatest disparities in access to quality education${where}, and what barriers are reported?`,
      why: 'Disaggregating access and quality can identify who is underserved and which barriers may be actionable.',
      relationship: `This tests how evenly the conditions described by ${topic} are shared across groups.`,
      evidence: 'Disaggregated enrollment and assessment data, household surveys, and studies of access barriers.',
      categories: ['Academic Research', 'Government and Official Sources', 'Reports and Statistical Data'],
    });
  }

  if (isHealth) {
    topics.splice(1, 0, {
      id: 'health-risk',
      title: 'Risk, prevention, and early detection',
      question: `Which risk factors and prevention or early-detection approaches are supported by evidence on ${topic}${where}?`,
      why: 'Separating established risk evidence from proposed prevention helps identify useful next steps without overstating causation.',
      relationship: `This examines risk and prevention pathways related to ${topic}.`,
      evidence: 'Systematic reviews, cohort studies, clinical or population data, and public-health guidance with cited evidence.',
      categories: ['Academic Research', 'Government and Official Sources', 'Reports and Statistical Data'],
    });
  }

  return topics;
}
