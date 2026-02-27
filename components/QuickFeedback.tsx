import React, { useState } from 'react';

const QuickFeedback = () => {
  const [mood, setMood] = useState('');

  const handleMoodChange = (event) => {
    setMood(event.target.value);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    // Handle the feedback submission logic here, like sending the mood to an API or service.
    console.log(`Mood selected: ${mood}`);
  };

  return (
    <div>
      <h2>Quick Feedback</h2>
      <form onSubmit={handleSubmit}>
        <label>
          How was your mood today?
          <select value={mood} onChange={handleMoodChange}>
            <option value="">--Please choose an option--</option>
            <option value="happy">Happy</option>
            <option value="neutral">Neutral</option>
            <option value="sad">Sad</option>
          </select>
        </label>
        <button type="submit">Submit</button>
      </form>
    </div>
  );
};

export default QuickFeedback;