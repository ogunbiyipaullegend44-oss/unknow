import { getRelatedTopics } from './relatedTopics.js';
import './RelatedTopics.css';

export default function RelatedTopics({ research, onInvestigate }) {
  const topics = getRelatedTopics(research);

  return (
    <section className="related-topics" aria-labelledby="related-topics-heading">
      <div className="related-topics-heading">
        <div>
          <h3 id="related-topics-heading">Related topics and follow-up questions</h3>
          <p>Follow-up questions and source types are tailored to your research topic. Choose a question to search for more evidence, or select a source type to record it as a priority for the follow-up.</p>
        </div>
      </div>

      <div className="related-topic-list">
        {topics.map((topic) => (
          <article className="related-topic-card" key={topic.id}>
            <h4>{topic.title}</h4>
            <button
              className="related-topic-question"
              type="button"
              onClick={() => onInvestigate(topic.question)}
            >
              <span>Suggested research question</span>
              <strong>{topic.question}</strong>
            </button>
            <dl className="related-topic-details">
              <div>
                <dt>Why it matters</dt>
                <dd>{topic.why}</dd>
              </div>
              <div>
                <dt>Connection to your research</dt>
                <dd>{topic.relationship}</dd>
              </div>
              <div>
                <dt>Evidence to look for</dt>
                <dd>{topic.evidence}</dd>
              </div>
            </dl>
            <div className="related-topic-categories">
              <span>Suggested source types</span>
              <div>
                {topic.categories.map((category) => (
                  <button
                    type="button"
                    className="related-topic-category"
                    key={category}
                    onClick={() => onInvestigate(topic.question, category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="related-topics-note">
        These are research directions, not findings. Source-type choices are saved as priorities; provider availability determines which sources can be retrieved.
      </p>
    </section>
  );
}
