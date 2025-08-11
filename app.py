from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import pandas as pd
import numpy as np
import os
import traceback
import joblib  # Add this import

app = Flask(__name__)
CORS(app)

# Load the trained model once when server starts
model = None

def load_model():
    global model
    try:
        # Updated path - now looking in Dataset folder from root
        model_path = 'Dataset/credit_score.pkl'
        
        if not os.path.exists(model_path):
            print(f"Model file not found at {model_path}")
            print(f"Current directory: {os.getcwd()}")
            print(f"Files in directory: {os.listdir('.')}")
            return False
            
        # Use joblib to load the composite model
        model = joblib.load(model_path)
        print("Composite model loaded successfully")
        print(f"Model components: {model.keys()}")
        return True
    except Exception as e:
        print(f"Error loading model: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        return False

# Simple rule-based credit score as fallback
def calculate_simple_credit_score(features):
    """
    Simple rule-based credit score calculation as fallback
    """
    score = 500  # Base score
    
    # Account age bonus (max +150 points)
    age_bonus = min(150, features['account_age_days'] / 10)
    score += age_bonus
    
    # Activity bonus (max +50 points) 
    activity_bonus = min(50, features['activity_frequency'] * 200)
    score += activity_bonus
    
    # Portfolio diversity bonus (max +50 points)
    diversity_bonus = features['portfolio_diversity'] * 50
    score += diversity_bonus
    
    # Transaction count bonus (max +50 points)
    tx_bonus = min(50, features['total_transactions'] / 10)
    score += tx_bonus
    
    # Collateral bonus (max +50 points)
    if features['total_collateral'] > 0:
        collateral_bonus = min(50, features['total_collateral'] / 10)
        score += collateral_bonus
    
    # Liquidation ratio bonus/penalty
    if features['liquidation_ratio'] > 2:
        score += 30  # Good collateralization
    elif features['liquidation_ratio'] < 1.2 and features['total_borrowed'] > 0:
        score -= 50  # Risky position
    
    # Debt penalty
    if features['total_borrowed'] > 100:
        score -= 20
    
    return max(300, min(850, int(score)))

@app.route('/predict-credit-score', methods=['POST'])
def predict_credit_score():
    try:
        if model is None:
            return jsonify({'error': 'Model not loaded'}), 500
            
        data = request.json
        
        # Prepare features DataFrame
        features_df = pd.DataFrame({
            'repayment_ratio': [data.get('repayment_ratio', 0)],
            'liquidation_ratio': [data.get('liquidation_ratio', 0)],
            'total_borrowed': [data.get('total_borrowed', 0)],
            'portfolio_diversity': [data.get('portfolio_diversity', 0)],
            'account_age_days': [data.get('account_age_days', 0)],
            'activity_frequency': [data.get('activity_frequency', 0)],
            'total_collateral': [data.get('total_collateral', 0)],
            'unique_tokens': [data.get('unique_tokens', 0)],
            'total_transactions': [data.get('total_transactions', 0)]
        })
        
        # Use your trained model components
        scaler = model['scaler']
        kmeans = model['kmeans']
        isoforest = model['isoforest']
        
        # Scale features
        X_scaled = scaler.transform(features_df)
        
        # Get cluster assignment
        cluster = kmeans.predict(X_scaled)[0]
        
        # Check for anomaly
        anomaly = isoforest.predict(X_scaled)[0]
        
        # Calculate credit score using your logic
        weights = np.array([0.25, 0.1, 0.1, 0.05, 0.15, 0.1, 0.15, 0.05, 0.05])
        score_raw = (X_scaled * weights).sum()
        
        # Convert to credit score range
        credit_score = max(300, min(850, int(500 + score_raw * 100)))
        
        # Apply anomaly penalty
        if anomaly == -1:
            credit_score = max(300, credit_score - 100)
        
        return jsonify({
            'credit_score': int(credit_score),  # Ensure int
            'cluster': int(cluster),           # Convert numpy int to Python int
            'is_anomaly': bool(anomaly == -1), # Convert to Python bool
            'features_used': features_df.to_dict('records')[0]
        })
        
    except Exception as e:
        print(f"Error in prediction: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None,
        'model_type': str(type(model)) if model else None,
        'has_predict': hasattr(model, 'predict') if model else False
    })

if __name__ == '__main__':
    print("Starting Flask server...")
    success = load_model()
    if not success:
        print("Warning: ML model not loaded properly, will use rule-based scoring")
    print("Server starting on http://localhost:5000")
    app.run(debug=True, port=5000)