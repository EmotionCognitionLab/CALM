region = "us-west-2"
env = "dev"
project = "calm"

cognito-callback-urls = ["https://dev.mindbodystudy.org/login/index.html", "http://localhost:9000/login/index.html", "http://localhost:5173/login"]
cognito-logout-url = ["https://dev.mindbodystudy.org/logout/success", "http://localhost:9000/logout/success"]
cognito-redirect-uri = "http://localhost:9000/login/index.html"

data-bucket = "calm-dev-usr-data"
ses-emailed-reports-bucket = "calm-dev-lumosity-reports"
redcap-backup-bucket = "calm-dev-rc-bkup"