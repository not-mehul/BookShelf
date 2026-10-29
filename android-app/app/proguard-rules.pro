# The web bridge uses WebViewCompat.addWebMessageListener (a normal listener
# object), not reflective @JavascriptInterface methods, so R8 needs no special
# keep rules for it. AndroidX libraries ship their own consumer rules.
