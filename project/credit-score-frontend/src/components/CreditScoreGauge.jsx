import React from "react";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";

/**
 * CreditScoreGauge Component
 * @param {number} score - The credit score (0-100)
 * @param {string} label - Optional label to display below the gauge
 */
function CreditScoreGauge({ score, label }) {
  return (
    <div style={{ width: 200, margin: "0 auto", textAlign: "center" }}>
      <CircularProgressbar
        value={score}
        text={`${score}`}
        styles={buildStyles({
          textColor: "#222",
          pathColor:
            score >= 75 ? "#28a745" : score >= 50 ? "#ffc107" : "#dc3545",
          trailColor: "#d6d6d6",
          textSize: "18px",
          strokeLinecap: "round",
        })}
      />
      {label && <p style={{ marginTop: 10, fontSize: "14px" }}>{label}</p>}
    </div>
  );
}

export default CreditScoreGauge;
