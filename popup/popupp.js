
    document.addEventListener('DOMContentLoaded', () => {
      const signOutBtn = document.getElementById('sign-OutBtn');
      
      signOutBtn.addEventListener('click', async () => {
        try {
          const response = await chrome.runtime.sendMessage({ type: 'LOGOUT' });
          if (response.ok) {
            window.close();
          } else {
            console.error('Logout failed:', response.error);
            alert('Logout failed. Please try again.');
          }
        } catch (error) {
          console.error('Logout error:', error);
          alert('Logout failed. Please try again.');
        }
      });
    });
  