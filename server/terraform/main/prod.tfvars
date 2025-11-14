region = "us-west-2"
env = "prod"
project = "calm"

cognito-callback-urls = ["https://mindbodystudy.org/login/index.html", "https://www.mindbodystudy.org/login/index.html"]
cognito-logout-url = ["https://mindbodystudy.org/logout/success", "https://www.mindbodystudy.org/logout/success"]
cognito-redirect-uri = "https://mindbodystudy.org/login/index.html"

data-bucket = "calm-prod-usr-data"
ses-emailed-reports-bucket = "calm-prod-lumosity-reports"
redcap-backup-bucket = "calm-prod-rc-bkup"