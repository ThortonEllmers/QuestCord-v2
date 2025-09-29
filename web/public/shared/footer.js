// QuestCord Standalone Footer Component
// This footer is completely isolated and will display consistently across all pages

(function() {
    'use strict';

    // Prevent duplicate footers
    if (document.querySelector('#questcord-footer')) {
        return;
    }

    // Self-contained CSS with unique variables to avoid conflicts
    const footerCSS = `
        <style id="questcord-footer-styles">
            /* Completely isolated footer with its own variables */

            /* Footer Container - Completely Isolated */
            #questcord-footer {
                /* Reset all potential inherited styles */
                all: initial;

                /* Core positioning */
                position: relative;
                display: block;
                width: 100%;
                margin: 0;
                padding: 0;
                box-sizing: border-box;

                /* Typography */
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 16px;
                line-height: 1.6;
                color: #ffffff;

                /* Background and Appearance - Using fixed colors instead of variables */
                background: linear-gradient(135deg, #1a1a2e 0%, #0f0f23 100%);
                border-top: 2px solid #5865f2;

                /* Spacing */
                margin-top: 80px;
                padding: 60px 0 30px;

                /* Isolation */
                isolation: isolate;
                z-index: 10;
            }

            /* Add a subtle top gradient line */
            #questcord-footer::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 1px;
                background: linear-gradient(90deg, transparent, #5865f2, transparent);
                opacity: 0.6;
            }

            /* Footer Container */
            #questcord-footer .footer-container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 0 24px;
                box-sizing: border-box;
            }

            /* Footer Content Grid */
            #questcord-footer .footer-content {
                display: grid;
                grid-template-columns: 1fr auto auto;
                align-items: center;
                gap: 40px;
                margin-bottom: 20px;
            }

            /* Brand Section */
            #questcord-footer .footer-brand {
                text-align: center;
            }

            #questcord-footer .footer-logo {
                font-size: 1.8rem;
                font-weight: 700;
                background: linear-gradient(135deg, #5865f2, #7c3aed);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                margin-bottom: 8px;
                display: block;
            }

            #questcord-footer .footer-tagline {
                color: #b9bbbe;
                font-size: 0.95rem;
                margin: 0;
                opacity: 0.9;
                line-height: 1.4;
            }

            #questcord-footer .footer-tagline .highlight {
                font-size: 1.1rem;
                font-weight: 600;
                background: linear-gradient(135deg, #5865f2, #7c3aed);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                display: block;
                margin-bottom: 4px;
            }

            /* Navigation Links */
            #questcord-footer .footer-links {
                display: flex;
                justify-content: center;
                gap: 8px;
                flex-wrap: wrap;
            }

            #questcord-footer .footer-links a {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 10px 16px;
                color: #b9bbbe;
                text-decoration: none;
                border-radius: 8px;
                transition: all 0.3s ease;
                font-weight: 500;
                font-size: 0.9rem;
                position: relative;
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.08);
                backdrop-filter: blur(4px);
            }

            #questcord-footer .footer-links a .icon {
                font-size: 1.1rem;
                transition: transform 0.3s ease;
            }

            #questcord-footer .footer-links a::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 50%;
                width: 0;
                height: 2px;
                background: #5865f2;
                transform: translateX(-50%);
                transition: width 0.3s ease;
            }

            #questcord-footer .footer-links a:hover {
                color: #ffffff;
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(255, 255, 255, 0.15);
                transform: translateY(-2px);
            }

            #questcord-footer .footer-links a:hover .icon {
                transform: scale(1.1);
            }

            #questcord-footer .footer-links a:hover::after {
                width: 80%;
            }

            /* Copyright Section */
            #questcord-footer .footer-copyright {
                text-align: center;
                color: #ffffff;
                font-size: 0.9rem;
                opacity: 0.9;
                margin: 0;
            }

            #questcord-footer .footer-copyright a {
                color: #5865f2;
                text-decoration: none;
                transition: color 0.2s ease;
                font-weight: 500;
            }

            #questcord-footer .footer-copyright a:hover {
                color: #ffffff;
            }

            /* Divider */
            #questcord-footer .footer-divider {
                height: 1px;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
                margin: 30px 0 20px;
                opacity: 0.6;
            }

            /* Responsive Design */
            @media (max-width: 768px) {
                #questcord-footer .footer-content {
                    grid-template-columns: 1fr;
                    gap: 30px;
                    text-align: center;
                }

                #questcord-footer .footer-links {
                    gap: 6px;
                }

                #questcord-footer .footer-links a {
                    padding: 8px 12px;
                    font-size: 0.85rem;
                }

                #questcord-footer {
                    margin-top: 60px;
                    padding: 40px 0 20px;
                }
            }

            @media (max-width: 480px) {
                #questcord-footer .footer-container {
                    padding: 0 16px;
                }

                #questcord-footer .footer-links {
                    gap: 4px;
                }

                #questcord-footer .footer-links a {
                    padding: 6px 10px;
                    font-size: 0.8rem;
                }

                #questcord-footer .footer-logo {
                    font-size: 1.6rem;
                }
            }
        </style>
    `;

    // Footer HTML structure
    const footerHTML = `
        <footer id="questcord-footer">
            <div class="footer-container">
                <div class="footer-content">
                    <div class="footer-brand">
                        <div class="footer-logo">QuestCord</div>
                        <p class="footer-tagline">
                            <span class="highlight">Discord's Ultimate</span>
                            Adventure Bot
                        </p>
                    </div>
                    <div class="footer-links">
                        <a href="/status">
                            <span class="icon">📊</span>
                            <span>Status</span>
                        </a>
                        <a href="/updates">
                            <span class="icon">📝</span>
                            <span>Updates</span>
                        </a>
                        <a href="/privacy">
                            <span class="icon">🔒</span>
                            <span>Privacy</span>
                        </a>
                        <a href="/terms">
                            <span class="icon">📄</span>
                            <span>Terms</span>
                        </a>
                        <a href="https://discord.gg/ACGKvKkZ5Z" target="_blank" rel="noopener">
                            <span class="icon">💬</span>
                            <span>Support</span>
                        </a>
                    </div>
                    <div class="footer-copyright">
                        <div>&copy; 2025 QuestCord</div>
                        <div>Made with ❤️ by <a href="https://discord.com/users/378501056008683530" target="_blank" rel="noopener" title="Message CUB on Discord">CUB</a> and <a href="#">Scarlett</a></div>
                    </div>
                </div>
                <div class="footer-divider"></div>
            </div>
        </footer>
    `;

    // Function to inject the footer
    function injectFooter() {
        // Add CSS to head if not already present
        if (!document.querySelector('#questcord-footer-styles')) {
            document.head.insertAdjacentHTML('beforeend', footerCSS);
        }

        // Add footer HTML to end of body
        document.body.insertAdjacentHTML('beforeend', footerHTML);
    }

    // Load footer when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectFooter);
    } else {
        injectFooter();
    }

})();