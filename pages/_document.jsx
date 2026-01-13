import Document, { Html, Head, Main, NextScript } from 'next/document';

class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          {/* Critical connection hints - prioritized */}
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="dns-prefetch" href="//img.plasmic.app" />
          <link rel="dns-prefetch" href="//img.plasmiccdn.com" />
          <link rel="dns-prefetch" href="//images.plasmic.app" />
          
          {/* Performance: Preconnect to Firebase if used */}
          <link rel="preconnect" href="https://firebase.googleapis.com" />
          <link rel="preconnect" href="https://firestore.googleapis.com" />
          
          {/* Resource hints for faster loading */}
          <link rel="prefetch" href="/api/hello" />

          {/* Self-hosted variable fonts preloads with font-display swap */}
          <link
            rel="preload"
            as="font"
            href="/fonts/GeistVF.woff"
            type="font/woff"
            crossOrigin="anonymous"
          />
          <link
            rel="preload"
            as="font"
            href="/fonts/GeistMonoVF.woff"
            type="font/woff"
            crossOrigin="anonymous"
          />
          <style
            dangerouslySetInnerHTML={{
              __html: `
                @font-face {
                  font-family: 'GeistVF';
                  src: url('/fonts/GeistVF.woff') format('woff');
                  font-display: swap;
                  font-weight: 100 900;
                }
                @font-face {
                  font-family: 'GeistMonoVF';
                  src: url('/fonts/GeistMonoVF.woff') format('woff');
                  font-display: swap;
                  font-weight: 100 900;
                }
                /* Site-wide loading screen */
                #app-loading-screen {
                  position: fixed;
                  top: 0;
                  left: 0;
                  right: 0;
                  bottom: 0;
                  width: 100%;
                  height: 100%;
                  height: 100dvh;
                  background-color: #ffffff;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  z-index: 99999;
                  transition: opacity 0.5s ease, visibility 0.5s ease;
                  margin: 0;
                  padding: 0;
                }
                #app-loading-screen.loading-hidden {
                  opacity: 0;
                  visibility: hidden;
                  pointer-events: none;
                }
                .loading-container {
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  width: 100%;
                  height: 100%;
                }
                .loading-gif {
                  width: 250px;
                  max-width: 80%;
                  height: auto;
                }
                /* Prevent scrolling while loading */
                body:not(.loaded) {
                  overflow: hidden;
                  height: 100vh;
                  height: 100dvh;
                }
              `,
            }}
          />

          {/* Preload loading GIF for instant display */}
          <link
            rel="preload"
            as="image"
            href="/elbrit one logo.gif"
          />

          {/* Minimize layout shift */}
          <meta name="theme-color" content="#ffffff" />

          {/* PWA manifest and icons */}
          <link rel="manifest" href="/manifest.webmanifest" />
          <meta name="application-name" content="Elbrit One" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <link rel="apple-touch-icon" href="/logo.svg" />
          <link rel="icon" type="image/svg+xml" href="/logo.svg" />
          <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        </Head>
        <body>
          {/* Loading screen with animated GIF */}
          <div id="app-loading-screen">
            <div className="loading-container">
              <img 
                src="/elbrit one logo.gif" 
                alt="Loading..." 
                className="loading-gif"
              />
            </div>
          </div>
          <Main />
          <NextScript />
          {/* Script to hide loading screen once app is ready */}
          <script
            dangerouslySetInnerHTML={{
              __html: `
                window.addEventListener('load', function() {
                  const loader = document.getElementById('app-loading-screen');
                  if (loader) {
                    loader.classList.add('loading-hidden');
                    document.body.classList.add('loaded');
                    // Completely remove from DOM after transition
                    setTimeout(() => {
                      loader.style.display = 'none';
                    }, 500);
                  }
                });
              `,
            }}
          />
        </body>
      </Html>
    );
  }
}

export default MyDocument;

