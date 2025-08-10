
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score
import numpy as np
import joblib
# Features to use for clustering and scoring
FEATURES = [
	'repayment_ratio',
	'liquidation_ratio',
	'total_borrowed',
	'portfolio_diversity',
	'account_age_days',
	'activity_frequency',
	'total_collateral',
	'unique_tokens',
	'total_transactions',
]
# Load the CSV data
csv_path = 'Dataset/aave_active_users_2025-08-10.csv'
df = pd.read_csv(csv_path)
# Keep only relevant features and drop rows with missing values in these columns
df = df[FEATURES].copy()
df = df.dropna()
# Standardize features
scaler = StandardScaler()
X_scaled = scaler.fit_transform(df)
# KMeans Clustering (k=3, max_iter=20 as per user request)
kmeans = KMeans(n_clusters=3, random_state=42, n_init=10, max_iter=20)
kmeans_labels = kmeans.fit_predict(X_scaled)
df['cluster'] = kmeans_labels
# Isolation Forest for anomaly detection
isoforest = IsolationForest(contamination=0.05, random_state=42)
anomaly_labels = isoforest.fit_predict(X_scaled)
df['anomaly'] = anomaly_labels  # -1 for anomaly, 1 for normal
# Clustering evaluation metrics
sil_score = silhouette_score(X_scaled, kmeans_labels)
davies_score = davies_bouldin_score(X_scaled, kmeans_labels)
calinski_score = calinski_harabasz_score(X_scaled, kmeans_labels)
print(f'Silhouette Score: {sil_score:.4f}')
print(f'Davies-Bouldin Index: {davies_score:.4f}')
print(f'Calinski-Harabasz Index: {calinski_score:.4f}')
# For each cluster, rank users by a weighted sum of features (customize weights as needed)
# Example: Give higher weight to repayment_ratio, total_collateral, account_age_days
weights = np.array([0.25, 0.1, 0.1, 0.05, 0.15, 0.1, 0.15, 0.05, 0.05])
df['score_raw'] = (X_scaled * weights).sum(axis=1)
# Assign credit scores within each cluster (higher score = better)
def assign_credit_scores(subdf):
	# Rank users within cluster
	subdf = subdf.copy()
	subdf['rank'] = subdf['score_raw'].rank(ascending=False, method='min')
	# Map rank to credit score (0-100)
	n = len(subdf)
	subdf['credit_score'] = 0 + (100 - 0) * (n - subdf['rank']) / (n-1) if n > 1 else 100
	return subdf
df = df.groupby('cluster', group_keys=False).apply(assign_credit_scores)
# Save results
output_path = 'Dataset/aave_active_users_credit_scores.csv'
df.to_csv(output_path, index=False)
# Save merged model
credit_score_model = {
	'scaler': scaler,
	'kmeans': kmeans,
	'isoforest': isoforest
}
joblib.dump(credit_score_model, 'Dataset/credit_score.pkl')
print(f'Credit scores assigned and saved to {output_path}')
print('Merged model saved to Dataset/credit_score.pkl')
