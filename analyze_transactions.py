import json
from datetime import datetime, timedelta
from collections import defaultdict, Counter
import pandas as pd

class WalletAnalyzer:
    def __init__(self, transactions_data):
        self.transactions = transactions_data
        self.df = pd.DataFrame(transactions_data) if transactions_data else pd.DataFrame()
    
    def calculate_portfolio_diversity(self):
        """Calculate portfolio diversity based on token types and transaction values"""
        if self.df.empty:
            return {"diversity_score": 0, "unique_tokens": 0, "token_distribution": {}}
        
        # Group by contract addresses and ETH transfers
        token_counts = defaultdict(float)
        
        for _, tx in self.df.iterrows():
            # Check if it's a contract interaction or ETH transfer
            to_address = tx.get('to', '')
            value = float(tx.get('value', 0))
            
            if value > 0:  # ETH transfer
                token_counts['ETH'] += value
            
            # Check for token transfers (contract interactions)
            if tx.get('functionName') and 'transfer' in tx.get('functionName', ''):
                token_counts[to_address] += 1  # Count token interactions
        
        unique_tokens = len(token_counts)
        
        # Calculate diversity score
        total_value = sum(token_counts.values())
        if total_value == 0:
            diversity_score = 0
        else:
            hhi = sum((value/total_value)**2 for value in token_counts.values())
            diversity_score = 1 - hhi
        
        return {
            "diversity_score": round(diversity_score, 3),
            "unique_tokens": unique_tokens,
            "token_distribution": dict(token_counts)
        }
    
    def calculate_account_age(self):
        """Calculate account age in days from first transaction"""
        if self.df.empty:
            return {"account_age_days": 0, "first_transaction": None}
        
        # Convert timestamps
        timestamps = []
        for _, tx in self.df.iterrows():
            timestamp = tx.get('timeStamp')
            if timestamp:
                try:
                    dt = datetime.fromtimestamp(int(timestamp))
                    timestamps.append(dt)
                except:
                    continue
        
        if not timestamps:
            return {"account_age_days": 0, "first_transaction": None}
        
        first_tx = min(timestamps)
        account_age_days = (datetime.now() - first_tx).days
        
        return {
            "account_age_days": account_age_days,
            "first_transaction": first_tx.isoformat()
        }
    
    def calculate_activity_frequency(self):
        """Calculate activity frequency metrics"""
        if self.df.empty:
            return {
                "total_transactions": 0,
                "avg_daily_transactions": 0,
                "most_active_day": None,
                "activity_periods": {}
            }
        
        # Parse dates from timestamps
        dates = []
        for _, tx in self.df.iterrows():
            timestamp = tx.get('timeStamp')
            if timestamp:
                try:
                    dt = datetime.fromtimestamp(int(timestamp))
                    dates.append(dt.date())
                except:
                    continue
        
        if not dates:
            return {
                "total_transactions": 0,
                "avg_daily_transactions": 0,
                "most_active_day": None,
                "activity_periods": {}
            }
        
        total_transactions = len(dates)
        date_counts = Counter(dates)
        
        # Calculate metrics
        first_date = min(dates)
        last_date = max(dates)
        total_days = (last_date - first_date).days + 1
        avg_daily_transactions = total_transactions / total_days if total_days > 0 else 0
        
        most_active_day = max(date_counts.items(), key=lambda x: x[1])
        
        # Activity periods
        now = datetime.now().date()
        periods = {
            "last_7_days": len([d for d in dates if (now - d).days <= 7]),
            "last_30_days": len([d for d in dates if (now - d).days <= 30]),
            "last_90_days": len([d for d in dates if (now - d).days <= 90])
        }
        
        return {
            "total_transactions": total_transactions,
            "avg_daily_transactions": round(avg_daily_transactions, 2),
            "most_active_day": {
                "date": most_active_day[0].isoformat(),
                "transaction_count": most_active_day[1]
            },
            "activity_periods": periods
        }
    
    def get_complete_analysis(self):
        """Get all analytics"""
        return {
            "portfolio_diversity": self.calculate_portfolio_diversity(),
            "account_age": self.calculate_account_age(),
            "activity_frequency": self.calculate_activity_frequency()
        }

def main():
    # Try to load wallet data first, then fall back to transactions.json
    try:
        with open('wallet_data.json', 'r') as f:
            wallet_data = json.load(f)
            transactions_data = wallet_data.get('transactions', [])
            print(f"Analyzing wallet: {wallet_data.get('address', 'Unknown')}")
    except:
        try:
            with open('transactions.json', 'r') as f:
                transactions_data = json.load(f)
        except:
            transactions_data = []
    
    # Analyze the data
    analyzer = WalletAnalyzer(transactions_data)
    analysis = analyzer.get_complete_analysis()
    
    # Print results
    print("\n=== WALLET ANALYSIS RESULTS ===")
    print(f"Portfolio Diversity Score: {analysis['portfolio_diversity']['diversity_score']}")
    print(f"Unique Tokens/Contracts: {analysis['portfolio_diversity']['unique_tokens']}")
    print(f"Account Age: {analysis['account_age']['account_age_days']} days")
    print(f"Total Transactions: {analysis['activity_frequency']['total_transactions']}")
    print(f"Average Daily Transactions: {analysis['activity_frequency']['avg_daily_transactions']}")
    
    if analysis['activity_frequency']['most_active_day']:
        print(f"Most Active Day: {analysis['activity_frequency']['most_active_day']['date']} ({analysis['activity_frequency']['most_active_day']['transaction_count']} transactions)")
    
    print(f"Recent Activity:")
    periods = analysis['activity_frequency']['activity_periods']
    print(f"  Last 7 days: {periods.get('last_7_days', 0)} transactions")
    print(f"  Last 30 days: {periods.get('last_30_days', 0)} transactions")
    print(f"  Last 90 days: {periods.get('last_90_days', 0)} transactions")
    
    return analysis

if __name__ == "__main__":
    analysis = main()