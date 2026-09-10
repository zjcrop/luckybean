package com.yuelan.bb9;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import android.util.Base64;

public class MainActivity extends Activity {
    private static final int REQ_SAVE = 4101;
    private static final int REQ_PICK = 4102;
    private static final int REQ_WEB_FILE = 4103;
    private WebView webView;
    private volatile CountDownLatch fileLatch;
    private volatile String fileResult;
    private volatile String pendingWriteText;
    private ValueCallback<Uri[]> webFileCallback;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        setContentView(webView);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);

        webView.addJavascriptInterface(new WebdavBridge(), "AndroidWebdav");
        webView.addJavascriptInterface(new FilesBridge(), "AndroidFiles");
        webView.addJavascriptInterface(new BarBridge(), "AndroidBar");
        webView.addJavascriptInterface(new AppBridge(), "AndroidApp");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (webFileCallback != null) webFileCallback.onReceiveValue(null);
                webFileCallback = cb;
                try { startActivityForResult(params.createIntent(), REQ_WEB_FILE); return true; }
                catch (Throwable e) { webFileCallback = null; return false; }
            }
        });
        WebView.setWebContentsDebuggingEnabled(false);
        webView.loadUrl("file:///android_asset/index.html");

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                this::dispatchBackToWeb
            );
        }
    }

    private void dispatchBackToWeb() {
        runOnUiThread(() -> {
            if (webView == null) return;
            webView.evaluateJavascript(
                "(function(){try{if(window.BBBack&&typeof BBBack.handleNativeBack==='function'){BBBack.handleNativeBack();return 'handled';}}catch(e){}return 'ignored';})()",
                null
            );
        });
    }

    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() {
        if (Build.VERSION.SDK_INT < 33) dispatchBackToWeb();
        else dispatchBackToWeb();
    }

    public class AppBridge {
        @JavascriptInterface public void exit() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 21) finishAndRemoveTask();
                else finish();
            });
        }
    }

    public class BarBridge {
        @JavascriptInterface public void apply(final long color, final boolean light) {
            runOnUiThread(() -> {
                Window w = getWindow(); int c=(int)color;
                w.setStatusBarColor(c); w.setNavigationBarColor(c);
                int f=w.getDecorView().getSystemUiVisibility();
                if(light) f|=View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                else f&=~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
                w.getDecorView().setSystemUiVisibility(f);
            });
        }
    }

    public class FilesBridge {
        @JavascriptInterface public String save(String name,String mime,String content) {
            CountDownLatch latch=new CountDownLatch(1); fileLatch=latch; fileResult="cancel"; pendingWriteText=content==null?"":content;
            runOnUiThread(() -> {
                try {
                    Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(mime==null||mime.isEmpty()?"text/plain":mime); i.putExtra(Intent.EXTRA_TITLE,name==null?"BunnyBear.txt":name);
                    startActivityForResult(i,REQ_SAVE);
                } catch(Throwable e){fileResult="__ERR__"+e.getMessage();latch.countDown();}
            });
            try{latch.await(180,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}
            return fileResult;
        }
        @JavascriptInterface public String pickText(String mimeCsv) {
            CountDownLatch latch=new CountDownLatch(1); fileLatch=latch; fileResult=""; pendingWriteText=null;
            runOnUiThread(() -> {
                try {
                    Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("*/*");
                    if(mimeCsv!=null&&!mimeCsv.trim().isEmpty()) i.putExtra(Intent.EXTRA_MIME_TYPES,mimeCsv.split(","));
                    startActivityForResult(i,REQ_PICK);
                } catch(Throwable e){fileResult="__ERR__"+e.getMessage();latch.countDown();}
            });
            try{latch.await(180,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}
            return fileResult==null?"":fileResult;
        }
    }

    public class WebdavBridge {
        private HttpURLConnection open(String method,String url,String user,String pass) throws Exception {
            HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection(); c.setRequestMethod(method);
            c.setConnectTimeout(15000); c.setReadTimeout(20000); c.setUseCaches(false);
            String auth=(user==null?"":user)+":"+(pass==null?"":pass);
            c.setRequestProperty("Authorization","Basic "+Base64.encodeToString(auth.getBytes(StandardCharsets.UTF_8),Base64.NO_WRAP));
            return c;
        }
        private String child(String base,String name){return base.replaceAll("/+$","")+"/"+Uri.encode(name==null?"":name,"-_.~");}
        @JavascriptInterface public String put(String base,String name,String user,String pass,String content){
            HttpURLConnection c=null; try{
                c=open("PUT",child(base,name),user,pass); c.setDoOutput(true); c.setRequestProperty("Content-Type","application/json; charset=utf-8");
                byte[] b=(content==null?"":content).getBytes(StandardCharsets.UTF_8); c.setFixedLengthStreamingMode(b.length);
                try(OutputStream o=c.getOutputStream()){o.write(b);} int code=c.getResponseCode(); return code>=200&&code<300?"ok":"HTTP "+code;
            }catch(Throwable e){return "__ERR__"+e.getMessage();}finally{if(c!=null)c.disconnect();}
        }
        @JavascriptInterface public String get(String base,String name,String user,String pass){
            HttpURLConnection c=null; try{
                c=open("GET",child(base,name),user,pass); int code=c.getResponseCode(); if(code==404)return ""; if(code<200||code>=300)return "__ERR__HTTP "+code;
                try(InputStream in=c.getInputStream()){return readStream(in);}
            }catch(Throwable e){return "__ERR__"+e.getMessage();}finally{if(c!=null)c.disconnect();}
        }
        @JavascriptInterface public String mkcol(String url,String user,String pass){
            HttpURLConnection c=null; try{c=open("MKCOL",url,user,pass);int code=c.getResponseCode();return (code>=200&&code<300)||code==405?"ok":"HTTP "+code;}
            catch(Throwable e){return "__ERR__"+e.getMessage();}finally{if(c!=null)c.disconnect();}
        }
    }

    private static String readStream(InputStream in) throws Exception {
        ByteArrayOutputStream out=new ByteArrayOutputStream(); byte[] b=new byte[32768]; int n;
        while((n=in.read(b))>=0)out.write(b,0,n); return out.toString(StandardCharsets.UTF_8.name());
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==REQ_WEB_FILE){
            if(webFileCallback!=null){Uri[] u=null;if(resultCode==RESULT_OK&&data!=null&&data.getData()!=null)u=new Uri[]{data.getData()};webFileCallback.onReceiveValue(u);webFileCallback=null;}return;
        }
        CountDownLatch latch=fileLatch;
        if(requestCode==REQ_SAVE){
            try{if(resultCode==RESULT_OK&&data!=null&&data.getData()!=null){try(OutputStream o=getContentResolver().openOutputStream(data.getData(),"wt")){if(o==null)throw new Exception("open failed");o.write((pendingWriteText==null?"":pendingWriteText).getBytes(StandardCharsets.UTF_8));}fileResult="ok";}else fileResult="cancel";}
            catch(Throwable e){fileResult="__ERR__"+e.getMessage();}if(latch!=null)latch.countDown();return;
        }
        if(requestCode==REQ_PICK){
            try{if(resultCode==RESULT_OK&&data!=null&&data.getData()!=null){try(InputStream in=getContentResolver().openInputStream(data.getData())){fileResult=in==null?"":readStream(in);}}else fileResult="";}
            catch(Throwable e){fileResult="__ERR__"+e.getMessage();}if(latch!=null)latch.countDown();
        }
    }
}
