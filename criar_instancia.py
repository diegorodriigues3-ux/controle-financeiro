import requests
import json

url = "http://localhost:8080/instance/create"

payload = json.dumps({
  "instanceName": "meu-whatsapp",
  "qrcode": True
})

headers = {
  'apikey': 'sua_chave_secreta_aqui',
  'Content-Type': 'application/json'
}

response = requests.request("POST", url, headers=headers, data=payload)

print(response.text)