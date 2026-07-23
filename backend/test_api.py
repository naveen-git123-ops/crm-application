import requests
import json

# Login first to get a token
login_response = requests.post('http://localhost:8000/api/auth/login', json={
    'email': 'admin@resoline.in',
    'password': 'admin123'
})

print('Login Status:', login_response.status_code)
if login_response.status_code == 200:
    token = login_response.json()['token']
    print('Token:', token[:50] + '...')
    
    # Now try to get orders
    headers = {'Authorization': f'Bearer {token}'}
    orders_response = requests.get('http://localhost:8000/api/orders', headers=headers)
    print('\nOrders Status:', orders_response.status_code)
    print('Orders Response:', orders_response.text[:2000])
else:
    print('Login Response:', login_response.text[:500])
