document.addEventListener('DOMContentLoaded', () => {

  console.log('UI Loaded');

  const buttons = [
    '#get-started-main',
    '#generate-link-btn',
    '#copy-link-btn'
  ];

  buttons.forEach(selector => {

    const btn = document.querySelector(selector);

    if (btn) {
      btn.addEventListener('click', () => {
        console.log(`${selector} clicked`);
        
        // Navigate to sign_up.html for Get Started button
        if (selector === '#get-started-main') {
          window.location.href = 'about.html';
        }
        
        // Generate link for Generate button
        if (selector === '#generate-link-btn') {
          const unique = Math.random().toString(36).substring(2, 8);
          const generatedLink = document.getElementById('generated-link');
          const linkSection = document.getElementById('link-section');
          
          if (generatedLink && linkSection) {
            // Generate a local link that actually works
            const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
            const landingUrl = `${baseUrl}landing%20page.html?invite=${unique}`;
            generatedLink.value = landingUrl;
            linkSection.style.display = 'block';
            
            // Make link clickable to navigate to landing page
            generatedLink.style.cursor = 'pointer';
            generatedLink.style.color = '#007bff';
            generatedLink.style.textDecoration = 'underline';
            generatedLink.addEventListener('click', () => {
              window.location.href = './landing page.html';
            });
          }
        }
        
        // Copy button functionality
        if (selector === '#copy-link-btn') {
          const generatedLink = document.getElementById('generated-link');
          if (generatedLink && generatedLink.value) {
            navigator.clipboard.writeText(generatedLink.value).then(() => {
              console.log('Link copied to clipboard');
              // Show success feedback
              const btn = document.querySelector('#copy-link-btn');
              const originalText = btn.textContent;
              btn.textContent = 'Copied!';
              setTimeout(() => {
                btn.textContent = originalText;
              }, 2000);
            }).catch(err => {
              console.error('Failed to copy:', err);
            });
          }
        }
      });
    }

  });

});
  


// // render recipe data
// const rendernotifications = (data, id) => {

//   const html = `
//     <div class="card-panel recipe white row" data-id="${id}">
//       <img src="/img/dish.png" alt="recipe thumb">
//       <div class="recipe-details">
//         <div class="recipe-title">${data.name}</div>
//         <div class="recipe-ingredients">${data.ingredients}</div>
//       </div>
//       <div class="recipe-delete">
//         <i class="material-icons" data-id="${id}">delete_outline</i>
//       </div>
//     </div>
//   `;
//   recipes.innerHTML += html;

