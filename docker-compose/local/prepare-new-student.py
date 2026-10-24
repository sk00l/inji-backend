"""Create the fictional Nisha login only. Never creates a wallet or issues a card."""
from local_wallet import ensure_account, login, checked, csrf, BASE

ensure_account('nisha', 'nisha-local-password', 'Nisha', 'Gurung')
session = login('nisha', 'nisha-local-password')
wallets = checked(session.get(BASE + '/wallets', timeout=20)).json()
if wallets:
    print('Nisha already has a wallet. Existing cards and PIN were preserved.')
else:
    print('Nisha login is ready: no wallet and no cards. Create the wallet in the browser.')
checked(session.post(BASE + '/logout', headers=csrf(session), timeout=20))
print('Wallet and college login: nisha / nisha-local-password')
