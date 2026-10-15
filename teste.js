async function criarInstancia() {
  console.log("Aguardando a API iniciar...");
  await new Promise(resolve => setTimeout(resolve, 6000));

  try {
    const response = await fetch('http://127.0.0.1:8080/instance/create', {
      method: 'POST',
      headers: {
        'apikey': '123456',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        "instanceName": "meu-whatsapp",
        "qrcode": true,
        "integration": "WHATSAPP-BAILEYS"
      })
    });

    const data = await response.json();
    console.log("Resposta da API:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Erro na requisição:", err);
  }
}

criarInstancia();