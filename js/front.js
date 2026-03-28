// Desactivar el portal por defecto y crear el tuyo
const express = require('express')
const app = express()

// Configurar tu frontend personalizado
app.use(express.static('public')) // Carpeta con tus archivos HTML/CSS/JS

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/views/index.html')
})

app.listen(3000, () => {
    console.log('Frontend personalizado en http://localhost:3000')
})

// Comentar o remover: QRPortalWeb()