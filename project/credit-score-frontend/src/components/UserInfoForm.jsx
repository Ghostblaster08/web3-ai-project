import { useState } from "react";
import { FaArrowRight } from "react-icons/fa";

export default function UserInfoForm({ onSubmit }) {
  const [userId, setUserId] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!userId) {
      alert("Please enter a User ID");
      return;
    }
    onSubmit(userId);
  };

  return (
    <div className="card">
      <h2>👤 User Information</h2>
      <p>Enter your user ID to check credit score</p>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Enter User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <button type="submit" className="primary-btn">
          <FaArrowRight /> Check Credit Score
        </button>
      </form>
    </div>
  );
}
