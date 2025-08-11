import React, { useEffect, useRef } from 'react';
import anime from 'animejs';
import './CreditScoreGauge.css';

const CreditScoreGauge = ({ score }) => {
  const gaugeRef = useRef(null);
  const needleRef = useRef(null);
  const scoreTextRef = useRef(null);

  useEffect(() => {
    if (score !== undefined) {
      // Animate the needle
      const rotation = (score / 100) * 180 - 90; // Convert to degrees (-90 to 90)
      
      anime({
        targets: needleRef.current,
        rotate: rotation,
        duration: 2000,
        easing: 'easeOutElastic(1, .6)'
      });

      // Animate the score text
      anime({
        targets: scoreTextRef.current,
        innerHTML: [0, score],
        duration: 2000,
        round: 1,
        easing: 'easeOutExpo'
      });

      // Animate the gauge appearance
      anime({
        targets: gaugeRef.current,
        scale: [0.8, 1],
        opacity: [0, 1],
        duration: 1000,
        easing: 'easeOutBack'
      });
    }
  }, [score]);

  const getScoreColor = (score) => {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#FFC107';
    if (score >= 40) return '#FF9800';
    return '#F44336';
  };

  const getScoreGrade = (score) => {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Very Good';
    if (score >= 70) return 'Good';
    if (score >= 60) return 'Fair';
    if (score >= 50) return 'Poor';
    return 'Very Poor';
  };

  return (
    <div className="credit-score-container">
      <div className="speedometer" ref={gaugeRef}>
        <svg width="300" height="200" viewBox="0 0 300 200">
          {/* Background arc */}
          <path
            d="M 50 150 A 100 100 0 0 1 250 150"
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="20"
            fill="none"
            strokeLinecap="round"
          />
          
          {/* Score arc */}
          <path
            d="M 50 150 A 100 100 0 0 1 250 150"
            stroke={getScoreColor(score)}
            strokeWidth="20"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 314} 314`}
            style={{
              filter: `drop-shadow(0 0 10px ${getScoreColor(score)}40)`
            }}
          />
          
          {/* Center circle */}
          <circle
            cx="150"
            cy="150"
            r="15"
            fill="rgba(255, 255, 255, 0.8)"
          />
          
          {/* Needle */}
          <line
            ref={needleRef}
            x1="150"
            y1="150"
            x2="150"
            y2="70"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinecap="round"
            style={{
              transformOrigin: '150px 150px',
              filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))'
            }}
          />
          
          {/* Score markers */}
          {[0, 20, 40, 60, 80, 100].map((value) => {
            const angle = (value / 100) * 180 - 90;
            const radian = (angle * Math.PI) / 180;
            const x1 = 150 + Math.cos(radian) * 85;
            const y1 = 150 + Math.sin(radian) * 85;
            const x2 = 150 + Math.cos(radian) * 95;
            const y2 = 150 + Math.sin(radian) * 95;
            
            return (
              <g key={value}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="rgba(255, 255, 255, 0.6)"
                  strokeWidth="2"
                />
                <text
                  x={150 + Math.cos(radian) * 110}
                  y={150 + Math.sin(radian) * 110}
                  fill="rgba(255, 255, 255, 0.8)"
                  fontSize="12"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {value}
                </text>
              </g>
            );
          })}
        </svg>
        
        <div className="score-display">
          <div className="score-number" style={{ color: getScoreColor(score) }}>
            <span ref={scoreTextRef}>0</span>
          </div>
          <div className="score-label">Credit Score</div>
          <div className="score-grade" style={{ color: getScoreColor(score) }}>
            {getScoreGrade(score)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditScoreGauge;
